import type { Model } from "../model/types";
import { DEFAULT_SHIFT_HOURS } from "../model/types";
import type { Capability } from "../model/capabilities";
import { catalogFor } from "../model/capabilities";
import { layoutRealism } from "./envelope";
import { capabilityCoverage } from "./coverage";
import { portfolioMatrix, portfolioCapacity } from "./portfolio";
import { customerTaktSec } from "./takt";
import { balanceAnalysis } from "./balance";
import { analyseWorkload } from "./workload";

// Testfit — the feasibility service (spec §20, audit C-04). It answers ONE
// question, deliberately kept separate from optimization: *can this line make
// this portfolio at all, and if not, which single constraint blocks it?* The
// rating engine grades how GOOD a buildable layout is (flow, travel, balance
// score); testfit is upstream of that — a go/no-go gate an engineer clears
// before optimizing a layout that may never be feasible in the first place.
//
// It is read-only and derives everything from the other engine modules, so its
// verdict can never disagree with the panels that show the same numbers. The
// gates run in a fixed priority so the "binding constraint" — the first thing to
// fix — is deterministic and matches how an industrialization engineer triages:
// a missing capability (needs capex/equipment) outranks a rate miss (process
// change), which outranks a volume overflow (shifts/lines), which outranks a
// physical layout clash (rearrange — usually the cheapest to resolve).

export type GateId = "coverage" | "takt" | "balance" | "capacity" | "layout";
export type GateStatus = "pass" | "warn" | "block" | "skipped";

export interface GateResult {
  id: GateId;
  label: string;
  status: GateStatus;
  /** One-line human summary of the gate's verdict. */
  summary: string;
  /** Specific violations behind a warn/block (empty on pass/skip). */
  detail: string[];
}

export interface TestfitViolation {
  gate: GateId;
  sev: "block" | "warn";
  msg: string;
}

export interface TestfitResult {
  /** True when no gate blocks. A warn-only result is still feasible. */
  feasible: boolean;
  verdict: "feasible" | "infeasible" | "insufficient-data";
  /** The single highest-priority blocking constraint — what to fix first. Null
   *  when nothing blocks. */
  bindingConstraint: TestfitViolation | null;
  /** Every violation (blocks first, then warns), in gate-priority order. */
  violations: TestfitViolation[];
  /** All gates in priority order, including passed/skipped ones. */
  gates: GateResult[];
}

// Gate priority = triage order. bindingConstraint is the first BLOCK here.
const GATE_ORDER: GateId[] = ["coverage", "takt", "balance", "capacity", "layout"];

const LABELS: Record<GateId, string> = {
  coverage: "Capability (Gate 1)",
  takt: "Takt rate",
  balance: "Work-content balance",
  capacity: "Capacity (Gate 3)",
  layout: "Layout realism",
};

export function testfit(model: Model, catalog: Capability[] = catalogFor(model)): TestfitResult {
  const gates: Record<GateId, GateResult> = {} as Record<GateId, GateResult>;

  // --- Coverage (Gate 1): can the resources make the workload at all? A part
  // portfolio is assessed part-by-part; absent that, the work elements' declared
  // capabilities. Missing = neither provided nor substitutable via the catalog.
  {
    const parts = model.parts ?? [];
    if (parts.length > 0) {
      const m = portfolioMatrix(model, catalog);
      const blocked = m.rows.filter((r) => r.verdict === "blocked");
      if (blocked.length === 0) {
        gates.coverage = { id: "coverage", label: LABELS.coverage, status: "pass", summary: `All ${m.total} part number${m.total === 1 ? "" : "s"} are runnable — every required capability is covered.`, detail: [] };
      } else {
        const top = m.blocking.slice(0, 3).map((b) => `${b.name} blocks ${b.blockedParts} part${b.blockedParts === 1 ? "" : "s"}`);
        gates.coverage = {
          id: "coverage",
          label: LABELS.coverage,
          status: "block",
          summary: `${blocked.length} of ${m.total} part number${m.total === 1 ? "" : "s"} cannot run — a required capability is missing.`,
          detail: top,
        };
      }
    } else {
      const cov = capabilityCoverage(model, catalog);
      if (cov.empty) {
        gates.coverage = { id: "coverage", label: LABELS.coverage, status: "skipped", summary: "No part portfolio or capability-tagged work — nothing to assess.", detail: [] };
      } else if (cov.missing === 0) {
        gates.coverage = { id: "coverage", label: LABELS.coverage, status: "pass", summary: `All ${cov.required.length} required capabilit${cov.required.length === 1 ? "y is" : "ies are"} covered${cov.alternative > 0 ? ` (${cov.alternative} via an alternative)` : ""}.`, detail: [] };
      } else {
        gates.coverage = {
          id: "coverage",
          label: LABELS.coverage,
          status: "block",
          summary: `${cov.missing} required capabilit${cov.missing === 1 ? "y is" : "ies are"} missing — the line cannot perform the work.`,
          detail: cov.required.filter((r) => r.status === "missing").map((r) => `${r.name} is not provided by any station`),
        };
      }
    }
  }

  // --- Takt rate: does the configured line's constraint step sit under the
  // customer takt? Needs demand (for takt) and process stations (for a
  // bottleneck). Without either, there is no rate to test yet.
  {
    const takt = customerTaktSec(model);
    const shiftHours = model.shiftHours ?? DEFAULT_SHIFT_HOURS;
    const bal = balanceAnalysis(model.stations, model.flows, shiftHours, takt);
    if (takt <= 0 || !bal.bottleneck) {
      gates.takt = {
        id: "takt",
        label: LABELS.takt,
        status: "skipped",
        summary: takt <= 0 ? "No demand modelled — customer takt is unknown, so rate feasibility can't be tested." : "No process station to constrain the line.",
        detail: [],
      };
    } else {
      const bn = bal.bottleneck;
      const gap = +(bn.cycle - takt).toFixed(1);
      if (gap > 0) {
        gates.takt = {
          id: "takt",
          label: LABELS.takt,
          status: "block",
          summary: `${bn.name} runs ${bn.cycle}s against a ${takt}s takt — ${gap}s over. The line cannot meet demand as configured.`,
          detail: [`Constraint step: ${bn.name} at ${bn.cycle}s/part`, `Customer takt: ${takt}s/part`],
        };
      } else {
        gates.takt = {
          id: "takt",
          label: LABELS.takt,
          status: "pass",
          summary: `The constraint (${bn.name} at ${bn.cycle}s) clears the ${takt}s takt with ${Math.abs(gap)}s headroom.`,
          detail: [],
        };
      }
    }
  }

  // --- Work-content balance: an element whose own worst-case time exceeds takt
  // can never fit a single station at any balance — it must be split, automated
  // or paralleled. This is upstream of the station bottleneck (it can fail before
  // any station exists). Needs work elements and a takt.
  {
    const takt = customerTaktSec(model);
    const elements = model.workElements ?? [];
    if (elements.length === 0 || takt <= 0) {
      gates.balance = {
        id: "balance",
        label: LABELS.balance,
        status: "skipped",
        summary: elements.length === 0 ? "No work elements — nothing to balance." : "No demand modelled — no takt to balance against.",
        detail: [],
      };
    } else {
      const wl = analyseWorkload(elements, model.variantModes, takt);
      if (wl.overTaktElements.length === 0) {
        gates.balance = {
          id: "balance",
          label: LABELS.balance,
          status: "pass",
          summary: `Every work element fits under the ${takt}s takt — the content is divisible into takt-feasible stations.`,
          detail: [],
        };
      } else {
        gates.balance = {
          id: "balance",
          label: LABELS.balance,
          status: "block",
          summary: `${wl.overTaktElements.length} work element${wl.overTaktElements.length === 1 ? "" : "s"} exceed the ${takt}s takt alone — they cannot fit one station and must be split, automated or paralleled.`,
          detail: wl.overTaktElements.map((e) => `${e.name}: ${e.maxSec}s worst-case vs ${takt}s takt`),
        };
      }
    }
  }

  // --- Capacity (Gate 3): does the whole portfolio's yearly load (processing +
  // changeover between campaigns) fit the available time? Needs runnable parts
  // carrying demand on a priced line.
  {
    const cap = portfolioCapacity(model, catalog);
    if (!cap.hasData) {
      gates.capacity = { id: "capacity", label: LABELS.capacity, status: "skipped", summary: "No runnable parts with demand on a priced line — capacity can't be assessed.", detail: [] };
    } else if (cap.overCapacity) {
      const dropList = cap.drop.map((d) => `Drop ${d.number} → frees ${Math.round(d.freedSecPerYear / 3600).toLocaleString()} h/yr`);
      gates.capacity = {
        id: "capacity",
        label: LABELS.capacity,
        status: "block",
        summary: `Portfolio load is ${cap.utilizationPct}% of available time — over capacity. The line cannot run everything demanded.`,
        detail: dropList.length ? ["To fit:", ...dropList] : [],
      };
    } else {
      gates.capacity = {
        id: "capacity",
        label: LABELS.capacity,
        status: "pass",
        summary: `Portfolio load is ${cap.utilizationPct}% of available time — it fits with ${(100 - cap.utilizationPct).toFixed(1)}% headroom.`,
        detail: [],
      };
    }
  }

  // --- Layout realism: is it physically buildable as drawn (envelope, clearance,
  // floor load, egress)? Error-level issues block; egress warnings warn.
  {
    const r = layoutRealism(model);
    const errs = r.issues.filter((i) => i.sev === "err");
    const warns = r.issues.filter((i) => i.sev === "warn");
    if (errs.length > 0) {
      gates.layout = {
        id: "layout",
        label: LABELS.layout,
        status: "block",
        summary: `${errs.length} layout error${errs.length === 1 ? "" : "s"} — the layout is not buildable as drawn.`,
        detail: errs.slice(0, 4).map((i) => i.msg),
      };
    } else if (warns.length > 0) {
      gates.layout = {
        id: "layout",
        label: LABELS.layout,
        status: "warn",
        summary: `${warns.length} layout warning${warns.length === 1 ? "" : "s"} — buildable, but review access/egress.`,
        detail: warns.slice(0, 4).map((i) => i.msg),
      };
    } else if (model.stations.length === 0) {
      gates.layout = { id: "layout", label: LABELS.layout, status: "skipped", summary: "No stations placed — nothing to check.", detail: [] };
    } else {
      gates.layout = { id: "layout", label: LABELS.layout, status: "pass", summary: "No realism issues — clearance, floor load and egress are satisfied.", detail: [] };
    }
  }

  const ordered = GATE_ORDER.map((id) => gates[id]);

  const violations: TestfitViolation[] = [];
  ordered.filter((g) => g.status === "block").forEach((g) => violations.push({ gate: g.id, sev: "block", msg: g.summary }));
  ordered.filter((g) => g.status === "warn").forEach((g) => violations.push({ gate: g.id, sev: "warn", msg: g.summary }));

  const bindingConstraint = violations.find((v) => v.sev === "block") ?? null;
  const anyAssessed = ordered.some((g) => g.status !== "skipped");
  const feasible = bindingConstraint === null;

  return {
    feasible,
    verdict: !anyAssessed ? "insufficient-data" : feasible ? "feasible" : "infeasible",
    bindingConstraint,
    violations,
    gates: ordered,
  };
}
