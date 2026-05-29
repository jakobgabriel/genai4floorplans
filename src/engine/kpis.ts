import type { Flow, Model, Station } from "../model/types";
import { center, rectDist } from "./geometry";

export interface FlowDetail extends Flow {
  dist: number;
  cost: number;
  travel: number;
}

export interface KPIResult {
  flowCost: number;
  travel: number;
  congestion: number;
  flowDetail: FlowDetail[];
}

type Grid = Pick<Model, "gridW" | "gridH">;

// Material-flow KPIs. flowCost = Σ(volume × rectilinear-distance × unitCost);
// travel = Σ(volume × distance); congestion = volume·distance for flows that
// cross the central corridor (a proxy, per spec §9). Ported from flowplan6.html.
export function computeKPIs(stations: Station[], flows: Flow[], grid: Grid): KPIResult {
  const byId: Record<string, Station> = {};
  stations.forEach((s) => {
    byId[s.id] = s;
  });
  let flowCost = 0;
  let travel = 0;
  let congestion = 0;
  const flowDetail: FlowDetail[] = [];
  const corridorY = grid.gridH / 2;
  flows.forEach((f) => {
    const a = byId[f.from];
    const b = byId[f.to];
    if (!a || !b) return;
    const d = rectDist(a, b);
    const cost = f.volume * d * f.unitCost;
    const trav = f.volume * d;
    flowCost += cost;
    travel += trav;
    const ya = center(a).y;
    const yb = center(b).y;
    if ((ya - corridorY) * (yb - corridorY) < 0) congestion += f.volume * d;
    flowDetail.push({ ...f, dist: +d.toFixed(2), cost, travel: trav });
  });
  return { flowCost, travel, congestion, flowDetail };
}
