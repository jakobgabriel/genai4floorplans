import type { Model, Station } from "../model/types";
import { computeKPIs } from "./kpis";
import { optimize } from "./optimize";
import { clampToGrid } from "./geometry";
import { cellTemplate, type CellForm } from "./templates";
import { cellTopology } from "./topology";

// The Improved view, made live.
//
// The old Improved view showed `optimize()` — pairwise position swaps of the
// current layout. On a generated cell the stations are already placed in flow
// order, so no swap helps and the view reads 0%: "improve" does nothing.
//
// A cell has more headroom than pairwise swaps can reach: the *form* itself
// (I/U/L/S) reshapes the whole material path. This module builds a genuinely
// better layout by trying every form and the pairwise optimiser and keeping the
// one with the lowest flow cost — then hands back the improved stations, a
// plain-language rationale, and the exact deltas.
//
// It only ever REPOSITIONS the existing movable stations (same ids, same
// count), so the result applies non-destructively through the reducer's
// APPLY_TEMPLATE / ACCEPT_PROPOSAL paths — never a silent structural overwrite
// (spec §4). Merging or removing stations stays an explicit suggestion in the
// Analysis backlog, never something Improved does behind the planner's back.

const ALL_FORMS: CellForm[] = ["I", "U", "L", "S"];

export type ImproveStrategy = "form" | "reposition" | "none";

export interface ImprovedLayout {
  /** The improved positions — same stations, same count, relocated only. */
  stations: Station[];
  strategy: ImproveStrategy;
  /** The form applied when strategy === "form"; null otherwise. */
  form: CellForm | null;
  /** Plain-language reason and predicted effect (§4, Law 6). */
  rationale: string;
  /** True when the improved layout is materially better than the current one. */
  better: boolean;
  deltas: {
    flowCostBefore: number;
    flowCostAfter: number;
    /** Negative = improvement. */
    flowCostPct: number;
    travelBefore: number;
    travelAfter: number;
    travelPct: number;
    /** Stations that moved. */
    moved: number;
  };
}

type Grid = { gridW: number; gridH: number; noGoZones: Model["noGoZones"] };

/** Reposition the movable process stations into `form`, mirroring APPLY_TEMPLATE. */
function applyForm(model: Model, form: CellForm): Station[] {
  const movable = model.stations.filter((s) => s.role === "process" && !s.fixed);
  const slots = cellTemplate(form, movable.length, model);
  let k = 0;
  return model.stations.map((s) => {
    if (s.role === "process" && !s.fixed) {
      const sl = slots[k++];
      if (sl) {
        const { x, y } = clampToGrid(s, sl.x, sl.y, model.gridW, model.gridH);
        return { ...s, x, y };
      }
    }
    return s;
  });
}

function movedCount(a: Station[], b: Station[]): number {
  const byId: Record<string, Station> = {};
  a.forEach((s) => { byId[s.id] = s; });
  return b.reduce((n, s) => {
    const o = byId[s.id];
    return o && (o.x !== s.x || o.y !== s.y) ? n + 1 : n;
  }, 0);
}

function pct(before: number, after: number): number {
  return before > 0 ? +(((after - before) / before) * 100).toFixed(1) : 0;
}

/**
 * Build the best genuinely-better layout for a cell by repositioning its
 * existing stations. Always returns a result: when nothing beats the current
 * layout, `better` is false and `strategy` is "none" so the UI can say "already
 * well laid out" honestly rather than inventing a change.
 */
export function improvedLayout(model: Model): ImprovedLayout {
  const grid: Grid = { gridW: model.gridW, gridH: model.gridH, noGoZones: model.noGoZones };
  const base = computeKPIs(model.stations, model.flows, grid);
  const movable = model.stations.filter((s) => s.role === "process" && !s.fixed);

  const noop: ImprovedLayout = {
    stations: model.stations,
    strategy: "none",
    form: null,
    rationale: "This layout is already close to the shortest material path for its stations — no repositioning helps.",
    better: false,
    deltas: {
      flowCostBefore: base.flowCost,
      flowCostAfter: base.flowCost,
      flowCostPct: 0,
      travelBefore: base.travel,
      travelAfter: base.travel,
      travelPct: 0,
      moved: 0,
    },
  };
  // Too few movable stations to reshape meaningfully.
  if (movable.length < 2 || !(base.flowCost > 0)) return noop;

  interface Candidate { stations: Station[]; strategy: ImproveStrategy; form: CellForm | null; cost: number }
  const candidates: Candidate[] = [];

  // 1) Pairwise reposition of the current layout (the old behaviour, kept).
  const repositioned = optimize(model.stations, model.flows, grid, { restarts: 4 });
  candidates.push({ stations: repositioned, strategy: "reposition", form: null, cost: computeKPIs(repositioned, model.flows, grid).flowCost });

  // 2) Each cell form — the reshape the pairwise optimiser cannot reach.
  ALL_FORMS.forEach((form) => {
    const stations = applyForm(model, form);
    candidates.push({ stations, strategy: "form", form, cost: computeKPIs(stations, model.flows, grid).flowCost });
  });

  // Keep the cheapest that beats the current layout by a real margin (>1%).
  candidates.sort((a, b) => a.cost - b.cost);
  const win = candidates[0];
  const gainPct = pct(base.flowCost, win.cost); // negative = better
  if (!(win.cost < base.flowCost) || gainPct > -1) return noop;

  const after = computeKPIs(win.stations, model.flows, grid);
  const moved = movedCount(model.stations, win.stations);
  const reduction = Math.abs(gainPct).toFixed(0);

  let rationale: string;
  if (win.strategy === "form" && win.form) {
    const topo = cellTopology(win.form, movable.length, model);
    const shape = win.form === "U" ? "U-cell (load and unload side by side)"
      : win.form === "L" ? "L-cell (one right-angle bend)"
      : win.form === "S" ? "serpentine (rows snake back)"
      : "straight I-line";
    rationale =
      `Re-laying the ${movable.length} movable stations as a ${shape} cuts flow cost ${reduction}% ` +
      `(${topo.legs} leg${topo.legs === 1 ? "" : "s"} along the ${win.form}-form path). ` +
      `Same stations, same work content — only the arrangement changes.`;
  } else {
    rationale =
      `Repositioning ${moved} station${moved === 1 ? "" : "s"} shortens the material flow, cutting flow cost ${reduction}%. ` +
      `Work content and station count are unchanged. Accept the moves individually or together on the Actual canvas — nothing moves until you do.`;
  }

  return {
    stations: win.stations,
    strategy: win.strategy,
    form: win.form,
    rationale,
    better: true,
    deltas: {
      flowCostBefore: +base.flowCost.toFixed(1),
      flowCostAfter: +after.flowCost.toFixed(1),
      flowCostPct: gainPct,
      travelBefore: +base.travel.toFixed(1),
      travelAfter: +after.travel.toFixed(1),
      travelPct: pct(base.travel, after.travel),
      moved,
    },
  };
}
