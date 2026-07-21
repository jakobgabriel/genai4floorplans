import type { Model, Station } from "../model/types";
import { computeKPIs } from "./kpis";
import { optimize, type OptimizeOptions } from "./optimize";
import { applyForm, type CellForm } from "./templates";

// The true layout floor.
//
// `optimize()` alone is a pairwise position-swap search: on a cell whose
// stations are already placed in flow order it finds almost nothing, so any
// score measured against it reads ~100% "optimal" even when a materially better
// arrangement exists. That made the rating blind to its own headroom — a layout
// 29% off the shortest material path still graded A.
//
// A cell's real headroom is the *form* (I/U/L/S), which reshapes the whole
// material path and pairwise swaps can never reach. `bestLayout` searches both —
// pairwise optimize AND every cell form — and returns the cheapest. It only ever
// REPOSITIONS the existing movable stations (same ids, same count), so it is a
// safe, non-destructive floor for both the rating and the Improved/Optimize
// flow, which share this one search.

const ALL_FORMS: CellForm[] = ["I", "U", "L", "S"];

export type BestStrategy = "form" | "reposition";

export interface BestLayout {
  /** The lowest-flow-cost positions — same stations, relocated only. */
  stations: Station[];
  strategy: BestStrategy;
  /** The form applied when strategy === "form"; null for a pairwise reposition. */
  form: CellForm | null;
  /** Flow cost of `stations`. */
  cost: number;
}

/**
 * Lowest-flow-cost layout reachable by repositioning the movable stations —
 * the cheapest of a pairwise optimize and each cell form. Deterministic.
 */
export function bestLayout(model: Model, opts: OptimizeOptions = {}): BestLayout {
  const grid = { gridW: model.gridW, gridH: model.gridH, noGoZones: model.noGoZones };
  const movable = model.stations.filter((s) => s.role === "process" && !s.fixed);

  const candidates: BestLayout[] = [];
  const repositioned = optimize(model.stations, model.flows, grid, { restarts: 4, ...opts });
  candidates.push({ stations: repositioned, strategy: "reposition", form: null, cost: computeKPIs(repositioned, model.flows, grid).flowCost });

  // Forms only make sense with ≥2 movable stations to arrange.
  if (movable.length >= 2) {
    ALL_FORMS.forEach((form) => {
      const stations = applyForm(model, form);
      candidates.push({ stations, strategy: "form", form, cost: computeKPIs(stations, model.flows, grid).flowCost });
    });
  }

  candidates.sort((a, b) => a.cost - b.cost);
  return candidates[0];
}
