import type { Confidence, Station } from "../model/types";
import { weakestConfidence } from "../model/types";
import type {
  AvailableTime,
  ChangeoverMatrix,
  GateNumber,
  LinePortfolio,
  PortfolioMember,
  Workload,
} from "./portfolioModel";
import { DEFAULT_AVAILABLE_TIME, GATE_NAMES } from "./portfolioModel";
import { analyseWorkload } from "../engine/workload";
import { sequenceMembers } from "./changeover";

// Multi-part line feasibility (spec §15.3).
//
// Five gates, cheapest first, so failures surface fast:
//
//   1 COVERAGE   every required capability has a providing resource on the line
//   2 TECHNICAL  the resource admits this workload's volume band
//   3 CAPACITY   run time + changeover time <= available time
//   4 BALANCE    a feasible station assignment exists per workload within takt
//   5 SPATIAL    the resource set places within the envelope
//
// Gates that cannot be assessed from the data present are reported as
// "not assessed" rather than silently passed — a pass we did not earn is worse
// than an honest gap.

export interface LineResource {
  /** Station id on the line. */
  id: string;
  name: string;
  /** Capability ids this resource provides. */
  provides: string[];
  /** Annual volume band this resource is validated for, if known. */
  volumeBand?: { minUnitsPerYear: number; maxUnitsPerYear: number };
}

/** Read the line's capability set from ordinary stations. */
export function resourcesFromStations(stations: Station[]): LineResource[] {
  return stations
    .filter((s) => s.role === "process")
    .map((s) => ({ id: s.id, name: s.name, provides: s.provides ?? [], volumeBand: s.volumeBand }));
}

export interface RequiredChange {
  type: "add_capability" | "add_resource" | "add_shift" | "reduce_scope" | "reduce_changeover";
  description: string;
}

export interface MemberFit {
  workloadId: string;
  name: string;
  verdict: "fits" | "fits_with_changes" | "infeasible";
  failedGate: GateNumber | null;
  blockingReason: string | null;
  missingCapabilities: string[];
  /** Annual demand normalised to units/year. */
  annualUnits: number;
  /** Run seconds per year for this member, after scrap. */
  runSeconds: number;
  /** Minimum stations at takt, from the worst variant mode. */
  minStations: number | null;
  requiredChanges: RequiredChange[];
  confidence: Confidence;
}

export interface CapacityReport {
  runTimeHours: number;
  changeoverTimeHours: number;
  availableHours: number;
  utilizationPct: number;
  /** Utilisation ignoring changeover — the number a spreadsheet would report. */
  utilizationExclChangeoverPct: number;
  /** Extra units of the current mix that would still fit. */
  headroomUnits: number;
}

export interface DropCandidate {
  workloadId: string;
  name: string;
  makesFeasible: boolean;
  utilizationAfterPct: number;
  /** Annual units given up. */
  unitsSacrificed: number;
}

export interface PortfolioFitResult {
  verdict: "all_fit" | "partial_fit" | "infeasible";
  perMember: MemberFit[];
  capacity: CapacityReport;
  sequence: {
    order: string[];
    totalChangeoverHours: number;
    changeoversPerYear: number;
    method: string;
    usedDefaults: boolean;
  };
  /** Gates that could not be evaluated from the data supplied. */
  notAssessed: Array<{ gate: GateNumber; name: string; why: string }>;
  dropAnalysis: DropCandidate[];
  confidence: Confidence;
  issues: string[];
}

const PERIODS_PER_YEAR: Record<string, number> = { shift: 460, day: 230, week: 46, year: 1 };

function annualUnits(member: PortfolioMember): number {
  return member.demand.unitsPerPeriod * (PERIODS_PER_YEAR[member.demand.period] ?? 1);
}

/** Available production seconds per year (spec §5.1). */
export function availableSeconds(t: AvailableTime = DEFAULT_AVAILABLE_TIME): number {
  const gross = t.hoursPerShift * t.shiftsPerDay * t.daysPerYear * 3600;
  return gross * (1 - clamp01(t.plannedDowntimePct)) * clamp01(t.availabilityPct);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n ?? 0));
}

export interface FeasibilityInput {
  portfolio: LinePortfolio;
  workloads: Workload[];
  resources: LineResource[];
  /** Stations available for assignment; used by gate 4. */
  stationCount: number;
  matrix?: ChangeoverMatrix;
  time?: AvailableTime;
  /** Set when a spatial check has been run elsewhere (gate 5). */
  spatialVerdict?: "fits" | "fits_with_changes" | "infeasible";
}

export function assessPortfolio(input: FeasibilityInput): PortfolioFitResult {
  const { portfolio, workloads, resources, stationCount, matrix } = input;
  const time = input.time ?? DEFAULT_AVAILABLE_TIME;
  const byId = new Map(workloads.map((w) => [w.id, w]));
  const provided = new Set(resources.flatMap((r) => r.provides));
  const anyVolumeBands = resources.some((r) => r.volumeBand);
  const available = availableSeconds(time);
  const issues: string[] = [];
  const notAssessed: PortfolioFitResult["notAssessed"] = [];

  // ---- per-member gates 1, 2, 4 -------------------------------------------
  const perMember: MemberFit[] = portfolio.members.map((m) => {
    const w = byId.get(m.workloadId);
    const units = annualUnits(m);

    if (!w) {
      return {
        workloadId: m.workloadId,
        name: m.workloadId,
        verdict: "infeasible",
        failedGate: 1,
        blockingReason: "Workload not found.",
        missingCapabilities: [],
        annualUnits: units,
        runSeconds: 0,
        minStations: null,
        requiredChanges: [],
        confidence: "low",
      };
    }

    const analysis = analyseWorkload(w.elements, w.variantModes);
    const yieldFactor = 1 - clamp01(w.scrapRate ?? 0);
    const runSeconds = yieldFactor > 0 ? (units * analysis.weightedTotalSec) / yieldFactor : Infinity;

    // Gate 1 — coverage.
    const missing = [
      ...new Set(
        w.elements
          .map((e) => e.capabilityId)
          .filter((c): c is string => !!c)
          .filter((c) => !provided.has(c)),
      ),
    ].sort();

    const requiredChanges: RequiredChange[] = [];
    if (missing.length > 0) {
      missing.forEach((c) =>
        requiredChanges.push({ type: "add_capability", description: `Line provides no resource for capability "${c}".` }),
      );
      return {
        workloadId: w.id,
        name: w.name,
        verdict: "infeasible",
        failedGate: 1,
        blockingReason: `Missing ${missing.length} capability/ies: ${missing.join(", ")}.`,
        missingCapabilities: missing,
        annualUnits: units,
        runSeconds,
        minStations: null,
        requiredChanges,
        confidence: analysis.confidence,
      };
    }

    // Gate 2 — technical fit against declared volume bands.
    const outOfBand = resources.filter(
      (r) =>
        r.volumeBand &&
        r.provides.some((c) => w.elements.some((e) => e.capabilityId === c)) &&
        (units < r.volumeBand.minUnitsPerYear || units > r.volumeBand.maxUnitsPerYear),
    );
    if (outOfBand.length > 0) {
      return {
        workloadId: w.id,
        name: w.name,
        verdict: "fits_with_changes",
        failedGate: 2,
        blockingReason: `${outOfBand.map((r) => r.name).join(", ")} validated outside ${units.toLocaleString("en-US")} units/yr.`,
        missingCapabilities: [],
        annualUnits: units,
        runSeconds,
        minStations: null,
        requiredChanges: [
          { type: "add_resource", description: `Re-validate or replace ${outOfBand.map((r) => r.name).join(", ")} for this volume.` },
        ],
        confidence: "low", // extrapolating beyond a validated range
      };
    }

    // Gate 4 — balance. Takt is this member's share of available time.
    const memberTakt = units > 0 ? available / units : Infinity;
    const balAnalysis = analyseWorkload(w.elements, w.variantModes, isFinite(memberTakt) ? memberTakt : undefined);
    const minStations = balAnalysis.minStationsWorst;
    if (minStations != null && minStations > stationCount) {
      return {
        workloadId: w.id,
        name: w.name,
        verdict: "infeasible",
        failedGate: 4,
        blockingReason: `Needs ${minStations} stations at ${memberTakt.toFixed(1)}s takt; the line has ${stationCount}.`,
        missingCapabilities: [],
        annualUnits: units,
        runSeconds,
        minStations,
        requiredChanges: [{ type: "add_resource", description: `Add ${minStations - stationCount} station(s), or reduce work content.` }],
        confidence: balAnalysis.confidence,
      };
    }

    return {
      workloadId: w.id,
      name: w.name,
      verdict: "fits",
      failedGate: null,
      blockingReason: null,
      missingCapabilities: [],
      annualUnits: units,
      runSeconds,
      minStations,
      requiredChanges: [],
      confidence: balAnalysis.confidence,
    };
  });

  // ---- gate 3 — capacity, including changeover ----------------------------
  const runnable = perMember.filter((m) => m.verdict !== "infeasible");
  const seq = sequenceMembers(runnable.map((m) => m.workloadId), matrix, portfolio.sequencingPolicy);

  const campaignsPerYear = Math.max(
    1,
    ...portfolio.members.map((m) => m.batchConstraints?.campaignFrequencyPerYear ?? 12),
  );
  const changeoverSeconds = seq.cycleInternalSeconds * campaignsPerYear;
  const runSecondsTotal = runnable.reduce((a, m) => a + (isFinite(m.runSeconds) ? m.runSeconds : 0), 0);
  const required = runSecondsTotal + changeoverSeconds;

  const capacity: CapacityReport = {
    runTimeHours: +(runSecondsTotal / 3600).toFixed(1),
    changeoverTimeHours: +(changeoverSeconds / 3600).toFixed(1),
    availableHours: +(available / 3600).toFixed(1),
    utilizationPct: available > 0 ? +((required / available) * 100).toFixed(1) : 0,
    utilizationExclChangeoverPct: available > 0 ? +((runSecondsTotal / available) * 100).toFixed(1) : 0,
    headroomUnits: 0,
  };

  // Headroom in units of the current mix.
  const secPerUnit = runnable.reduce((a, m) => a + m.annualUnits, 0) > 0
    ? runSecondsTotal / runnable.reduce((a, m) => a + m.annualUnits, 0)
    : 0;
  capacity.headroomUnits = secPerUnit > 0 ? Math.max(0, Math.floor((available - required) / secPerUnit)) : 0;

  const overCapacity = required > available;
  if (overCapacity) {
    issues.push(
      `Capacity short: ${capacity.utilizationPct}% loaded (${capacity.changeoverTimeHours}h of that is changeover).`,
    );
    runnable.forEach((m) => {
      if (m.verdict === "fits") {
        m.verdict = "fits_with_changes";
        m.failedGate = 3;
        m.blockingReason = "Line is over capacity across the portfolio.";
        m.requiredChanges.push({ type: "add_shift", description: "Add a shift, cut changeover, or drop a member." });
      }
    });
  }
  if (capacity.changeoverTimeHours > 0 && changeoverSeconds / Math.max(1, required) > 0.15) {
    issues.push(
      `Changeover consumes ${((changeoverSeconds / required) * 100).toFixed(0)}% of loaded time — SMED or family grouping would pay back fastest.`,
    );
  }
  if (seq.usedDefaults) {
    issues.push("Some changeover pairs fell back to the matrix default — the changeover figure is indicative only.");
  }

  // ---- gate 5 — spatial, only if supplied ---------------------------------
  if (input.spatialVerdict === "infeasible") {
    perMember.forEach((m) => {
      if (m.verdict === "fits") {
        m.verdict = "infeasible";
        m.failedGate = 5;
        m.blockingReason = "Resource set does not place within the envelope.";
      }
    });
  } else if (!input.spatialVerdict) {
    notAssessed.push({ gate: 5, name: GATE_NAMES[5], why: "No envelope supplied — spatial fit was not checked." });
  }
  if (!anyVolumeBands) {
    notAssessed.push({ gate: 2, name: GATE_NAMES[2], why: "No resource declares a volume band — technical fit was not checked." });
  }

  // ---- drop analysis ------------------------------------------------------
  const dropAnalysis: DropCandidate[] = overCapacity
    ? portfolio.members
        .filter((m) => m.priority !== "must_run")
        .map((m) => {
          const fit = perMember.find((p) => p.workloadId === m.workloadId);
          const withoutRun = runSecondsTotal - (fit && isFinite(fit.runSeconds) ? fit.runSeconds : 0);
          const remaining = runnable.filter((r) => r.workloadId !== m.workloadId).map((r) => r.workloadId);
          const seqAfter = sequenceMembers(remaining, matrix, portfolio.sequencingPolicy);
          const afterRequired = withoutRun + seqAfter.cycleInternalSeconds * campaignsPerYear;
          return {
            workloadId: m.workloadId,
            name: fit?.name ?? m.workloadId,
            makesFeasible: afterRequired <= available,
            utilizationAfterPct: available > 0 ? +((afterRequired / available) * 100).toFixed(1) : 0,
            unitsSacrificed: fit?.annualUnits ?? 0,
          };
        })
        // Cheapest sacrifice that actually helps, first.
        .sort((a, b) =>
          a.makesFeasible === b.makesFeasible ? a.unitsSacrificed - b.unitsSacrificed : a.makesFeasible ? -1 : 1,
        )
    : [];

  const infeasible = perMember.filter((m) => m.verdict === "infeasible").length;
  const clean = perMember.filter((m) => m.verdict === "fits").length;
  const verdict: PortfolioFitResult["verdict"] =
    infeasible === perMember.length && perMember.length > 0
      ? "infeasible"
      : clean === perMember.length
        ? "all_fit"
        : "partial_fit";

  return {
    verdict,
    perMember,
    capacity,
    sequence: {
      order: seq.order,
      totalChangeoverHours: capacity.changeoverTimeHours,
      changeoversPerYear: seq.changeoversPerCycle * campaignsPerYear,
      method: seq.method,
      usedDefaults: seq.usedDefaults,
    },
    notAssessed,
    dropAnalysis,
    confidence: weakestConfidence(perMember.map((m) => m.confidence).concat(matrix ? [matrix.confidence] : [])),
    issues,
  };
}

/**
 * Gate 1 on its own — the cheapest and most-often-wrong question: which parts
 * simply cannot run on this line, and what capability is missing?
 */
export function coverageCheck(
  workloads: Workload[],
  resources: LineResource[],
): Array<{ workloadId: string; name: string; missing: string[] }> {
  const provided = new Set(resources.flatMap((r) => r.provides));
  return workloads.map((w) => ({
    workloadId: w.id,
    name: w.name,
    missing: [
      ...new Set(
        w.elements
          .map((e) => e.capabilityId)
          .filter((c): c is string => !!c)
          .filter((c) => !provided.has(c)),
      ),
    ].sort(),
  }));
}
