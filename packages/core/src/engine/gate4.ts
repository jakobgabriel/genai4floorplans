import type { Model } from "../model/types";
import { isFlowFunction } from "../model/types";
import { customerTaktSec } from "./takt";
import { analyseWorkload } from "./workload";

// Gate 4 — Balance (spec §18 Gate 4). The last feasibility gate: once the line
// CAN make the work (Gate 1), fits the volume band (Gate 2) and has the capacity
// (Gate 3), can the work content actually be *balanced onto the line's stations*?
//
// Two ways it fails, both independent of how good the layout is:
//   1. An indivisible element whose own worst-case time exceeds takt — it cannot
//      fit a single station at ANY balance, so it must be split, automated or
//      paralleled before the line is feasible.
//   2. The line has fewer work stations than the theoretical minimum
//      (Σ work ÷ takt) — even a perfect balance cannot squeeze the content into
//      too few stations.
//
// Balanced against the HEAVIEST mode, not the mix average: balancing to the
// average starves the heavy variant (spec §11). Gated on work elements + a takt,
// so a model without a modelled workload is simply "not assessed".

export interface Gate4OverTakt {
  id: string;
  name: string;
  /** Worst-case seconds in its heaviest mode. */
  maxSec: number;
}

export interface Gate4Balance {
  /** True when there is a workload and a takt to balance against. */
  hasData: boolean;
  taktSec: number;
  /** Process work steps on the line — the fixed count to balance into. */
  availableStations: number;
  /** Theoretical minimum stations (heaviest-mode work ÷ takt, ceil) — perfect
   *  balance, no loss allowance. */
  minStations: number | null;
  /** Realistic count once balancing/walking loss is allowed (heaviest mode,
   *  UNROUNDED — the decimal says how much headroom remains). */
  requiredStations: number | null;
  /** Elements that cannot fit one station at any balance. */
  overTakt: Gate4OverTakt[];
  /** True when stations are placed but there are fewer than the minimum: the
   *  work physically cannot be balanced onto the line as drawn. */
  understaffed: boolean;
  /** No over-takt element AND not understaffed. */
  feasible: boolean;
  note: string;
}

export function gate4Balance(model: Model): Gate4Balance {
  const takt = customerTaktSec(model);
  const elements = model.workElements ?? [];
  const availableStations = model.stations.filter((s) => s.role === "process" && !isFlowFunction(s)).length;

  if (elements.length === 0 || takt <= 0) {
    return {
      hasData: false,
      taktSec: takt,
      availableStations,
      minStations: null,
      requiredStations: null,
      overTakt: [],
      understaffed: false,
      feasible: true,
      note: elements.length === 0 ? "No work elements to balance." : "No demand modelled — no takt to balance against.",
    };
  }

  const wl = analyseWorkload(elements, model.variantModes, takt);
  const minStations = wl.minStationsWorst;
  const requiredStations = wl.stationsCalculatedWorst;
  const overTakt: Gate4OverTakt[] = wl.overTaktElements.map((e) => ({ id: e.elementId, name: e.name, maxSec: e.maxSec }));

  // Understaffed only bites once stations are actually placed: a workload-only
  // model (no stations yet) states its requirement rather than failing.
  const understaffed = availableStations > 0 && minStations != null && availableStations < minStations;
  const feasible = overTakt.length === 0 && !understaffed;

  let note: string;
  if (overTakt.length > 0) {
    note = `${overTakt.length} element${overTakt.length === 1 ? "" : "s"} exceed the ${takt}s takt alone — split, automate or parallelise before the workload can be balanced.`;
  } else if (understaffed) {
    note = `The workload needs at least ${minStations} station${minStations === 1 ? "" : "s"} at ${takt}s takt, but the line has ${availableStations} — it cannot be balanced onto the line as drawn.`;
  } else if (availableStations === 0) {
    note = `The workload balances into ~${requiredStations} station${requiredStations === 1 ? "" : "s"} (≥${minStations} minimum) at ${takt}s takt — none are placed yet.`;
  } else {
    note = `The workload balances onto the line: ${availableStations} station${availableStations === 1 ? "" : "s"} available for a ${minStations}-station minimum (~${requiredStations} realistic).`;
  }

  return {
    hasData: true,
    taktSec: takt,
    availableStations,
    minStations,
    requiredStations,
    overTakt,
    understaffed,
    feasible,
    note,
  };
}
