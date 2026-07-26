import type { Confidence, VariantMode, WorkElement } from "../model/types";
import { weakestConfidence } from "../model/types";
import { modesOf, multiplierFor } from "./workload";

// Line balancing — element-to-station assignment (spec §5.2, SALBP-1).
//
// This is the piece that makes the layout GENERATED rather than authored. The
// planner supplies work elements; the balancer decides how many stations there
// are and what each one does. Nobody types a station.
//
// Method: ranked positional weight (RPW) — order elements by their own time
// plus everything downstream of them, then fill stations greedily subject to
// precedence, zoning and takt. Deterministic, no randomness, O(n²), and well
// under the spec's 30s budget for 200 elements.
//
// It is a heuristic, and says so: `method: "heuristic"` and an `optimalityGap`
// against the theoretical bound. CP-SAT can replace it behind this same
// interface (§8) without touching callers.

export interface AssignedStation {
  id: string;
  sequence: number;
  elementIds: string[];
  /** Worst-mode cycle time — the figure feasibility must use. */
  cycleTimeSec: number;
  /** Mix-weighted cycle time — the figure throughput planning uses. */
  weightedCycleSec: number;
  /** Operator-bound seconds, from attendedFraction. Drives manning. */
  attendedSec: number;
  /** Operators needed to cover the attended work within takt. */
  operators: number;
  utilizationPct: number;
  isBottleneck: boolean;
  /** Idle seconds against takt. */
  idleSec: number;
  capabilityIds: string[];
}

export interface AssignmentResult {
  stations: AssignedStation[];
  taktSec: number;
  /** Theoretical minimum stations: ceil(total work / takt). */
  theoreticalMin: number;
  /** (actual − theoretical) / theoretical, %. 0 = optimal station count. */
  optimalityGapPct: number;
  /** Total idle across stations, as a share of station-time. */
  balanceLossPct: number;
  totalOperators: number;
  method: "heuristic-rpw";
  confidence: Confidence;
  /** Elements that could not be placed, with the reason. */
  unassigned: Array<{ elementId: string; reason: string }>;
  issues: string[];
}

interface Prepared {
  el: WorkElement;
  worstSec: number;
  weightedSec: number;
  attendedSec: number;
  rpw: number;
}

/**
 * Assign elements to stations for a given takt.
 *
 * Mixed-model aware: station feasibility uses the WORST mode's time, because a
 * station that only fits on average starves the line whenever the heavy variant
 * runs. Weighted time is carried alongside for throughput and cost.
 */
export function assignStations(
  elements: WorkElement[],
  taktSec: number,
  variantModes?: VariantMode[],
  opts: { maxStations?: number } = {},
): AssignmentResult {
  const issues: string[] = [];
  const unassigned: Array<{ elementId: string; reason: string }> = [];

  if (elements.length === 0 || !(taktSec > 0)) {
    return {
      stations: [],
      taktSec: Math.max(0, taktSec),
      theoreticalMin: 0,
      optimalityGapPct: 0,
      balanceLossPct: 0,
      totalOperators: 0,
      method: "heuristic-rpw",
      confidence: "low",
      unassigned: elements.map((e) => ({ elementId: e.id, reason: "No takt — nothing to balance against." })),
      issues: taktSec > 0 ? [] : ["Takt must be greater than zero."],
    };
  }

  const modes = modesOf(variantModes);
  const shares = modes.map((m) => Math.max(0, m.share));
  const shareSum = shares.reduce((a, b) => a + b, 0) || 1;

  const byId = new Map(elements.map((e) => [e.id, e]));
  const timeOf = (el: WorkElement) => {
    const per = modes.map((m) => el.time.seconds * multiplierFor(m, el.id));
    return {
      worst: Math.max(...per),
      weighted: per.reduce((a, sec, i) => a + sec * (shares[i] / shareSum), 0),
    };
  };

  // Successor closure, for ranked positional weight.
  const successors = new Map<string, Set<string>>();
  elements.forEach((e) => successors.set(e.id, new Set()));
  elements.forEach((e) => e.predecessors.forEach((p) => successors.get(p)?.add(e.id)));

  const closureCache = new Map<string, Set<string>>();
  const closure = (id: string): Set<string> => {
    const hit = closureCache.get(id);
    if (hit) return hit;
    const out = new Set<string>();
    const stack = [...(successors.get(id) ?? [])];
    while (stack.length) {
      const n = stack.pop() as string;
      if (out.has(n)) continue;
      out.add(n);
      (successors.get(n) ?? new Set()).forEach((s) => stack.push(s));
    }
    closureCache.set(id, out);
    return out;
  };

  const prepared: Prepared[] = elements.map((el) => {
    const t = timeOf(el);
    const downstream = [...closure(el.id)].reduce((a, id) => {
      const e = byId.get(id);
      return a + (e ? timeOf(e).worst : 0);
    }, 0);
    return {
      el,
      worstSec: t.worst,
      weightedSec: t.weighted,
      attendedSec: t.weighted * Math.max(0, Math.min(1, el.attendedFraction ?? 1)),
      rpw: t.worst + downstream,
    };
  });

  const totalWorst = prepared.reduce((a, p) => a + p.worstSec, 0);
  const theoreticalMin = Math.ceil(totalWorst / taktSec);

  // Any single element longer than takt can never fit a station.
  prepared.forEach((p) => {
    if (p.worstSec > taktSec) {
      issues.push(`"${p.el.name}" needs ${p.worstSec.toFixed(1)}s against a ${taktSec.toFixed(1)}s takt — split it, automate it, or run it in parallel.`);
    }
  });

  // Highest positional weight first; ties break on id so runs are reproducible.
  const order = prepared.slice().sort((a, b) => (b.rpw - a.rpw) || a.el.id.localeCompare(b.el.id));

  const placed = new Set<string>();
  const stationOf = new Map<string, number>();
  const stations: Array<{ ids: string[]; worst: number; weighted: number; attended: number }> = [];
  const maxStations = opts.maxStations ?? Math.max(1, elements.length);

  const precedenceMet = (el: WorkElement) => el.predecessors.every((p) => !byId.has(p) || placed.has(p));

  let guard = 0;
  while (placed.size < prepared.length && guard < prepared.length * 4) {
    guard++;
    const station = { ids: [] as string[], worst: 0, weighted: 0, attended: 0 };
    let addedAny = false;

    // Fill this station until nothing else fits.
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const cand of order) {
        const el = cand.el;
        if (placed.has(el.id)) continue;
        if (!precedenceMet(el)) continue;

        // Zoning: must-not co-locate. Checked in both directions — the
        // constraint is symmetric even when only one side declares it.
        const conflict =
          (el.mustNotBeSameStationAs ?? []).some((o) => station.ids.includes(o)) ||
          station.ids.some((sid) => (byId.get(sid)?.mustNotBeSameStationAs ?? []).includes(el.id));
        if (conflict) continue;

        // An element longer than takt still has to go somewhere: give it a
        // station of its own rather than dropping it silently.
        const oversize = cand.worstSec > taktSec;
        if (!oversize && station.worst + cand.worstSec > taktSec + 1e-9) continue;
        if (oversize && station.ids.length > 0) continue;

        station.ids.push(el.id);
        station.worst += cand.worstSec;
        station.weighted += cand.weightedSec;
        station.attended += cand.attendedSec;
        placed.add(el.id);
        stationOf.set(el.id, stations.length);
        addedAny = true;
        progressed = true;

        // Zoning: pull must-be-together elements in immediately.
        (el.mustBeSameStationAs ?? []).forEach((o) => {
          const mate = prepared.find((p) => p.el.id === o);
          if (!mate || placed.has(o) || !precedenceMet(mate.el)) return;
          station.ids.push(o);
          station.worst += mate.worstSec;
          station.weighted += mate.weightedSec;
          station.attended += mate.attendedSec;
          placed.add(o);
          stationOf.set(o, stations.length);
        });

        if (oversize) break;
      }
    }

    if (!addedAny) {
      // Nothing placeable — precedence deadlock (a cycle) or all blocked.
      prepared.filter((p) => !placed.has(p.el.id)).forEach((p) =>
        unassigned.push({ elementId: p.el.id, reason: "Precedence could not be satisfied — check for a cycle." }),
      );
      issues.push("Some elements could not be placed; the precedence graph may contain a cycle.");
      break;
    }
    stations.push(station);
    if (stations.length >= maxStations && placed.size < prepared.length) {
      prepared.filter((p) => !placed.has(p.el.id)).forEach((p) =>
        unassigned.push({ elementId: p.el.id, reason: `Station cap of ${maxStations} reached.` }),
      );
      issues.push(`Hit the ${maxStations}-station cap with ${prepared.length - placed.size} element(s) unplaced.`);
      break;
    }
  }

  const maxCycle = stations.reduce((a, s) => Math.max(a, s.worst), 0);
  const out: AssignedStation[] = stations.map((s, i) => {
    const caps = [
      ...new Set(s.ids.map((id) => byId.get(id)?.capabilityId).filter((c): c is string => !!c)),
    ];
    return {
      id: "st" + (i + 1),
      sequence: i + 1,
      elementIds: s.ids,
      cycleTimeSec: +s.worst.toFixed(2),
      weightedCycleSec: +s.weighted.toFixed(2),
      attendedSec: +s.attended.toFixed(2),
      // Operators are driven by operator-bound work, not by total cycle: an
      // unattended machine cycle does not occupy anybody.
      operators: Math.max(s.attended > 0 ? 1 : 0, Math.ceil(s.attended / taktSec - 1e-9)),
      utilizationPct: +((s.worst / taktSec) * 100).toFixed(1),
      isBottleneck: Math.abs(s.worst - maxCycle) < 1e-9 && maxCycle > 0,
      idleSec: +Math.max(0, taktSec - s.worst).toFixed(2),
      capabilityIds: caps,
    };
  });

  const stationTime = out.length * taktSec;
  const idle = out.reduce((a, s) => a + s.idleSec, 0);

  return {
    stations: out,
    taktSec: +taktSec.toFixed(2),
    theoreticalMin,
    optimalityGapPct: theoreticalMin > 0 ? +(((out.length - theoreticalMin) / theoreticalMin) * 100).toFixed(1) : 0,
    balanceLossPct: stationTime > 0 ? +((idle / stationTime) * 100).toFixed(1) : 0,
    totalOperators: out.reduce((a, s) => a + s.operators, 0),
    method: "heuristic-rpw",
    confidence: weakestConfidence(elements.map((e) => e.time.confidence)),
    unassigned,
    issues,
  };
}
