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

/** Placement efficiency (audit A-03): the share of the cell's bounding rectangle
 *  actually occupied by equipment — a compactness score, 0–100. It is genuinely
 *  distinct from flow cost: a cell can have cheap flow yet sprawl across the
 *  floor (dead space, long walks, wasted rent), or pack tightly. Higher is
 *  better. Measured over process work steps (the movable work content); a cell
 *  with fewer than two placed steps is trivially "packed" and scores 100.
 *
 *  Replaces the former `sPlace = sFlow` copy, which double-counted flow cost and
 *  left the tool with no real placement metric despite advertising one. */
export function placementScore(stations: Station[]): number {
  const work = stations.filter((s) => s.role === "process" && s.w > 0 && s.h > 0);
  if (work.length < 2) return 100;
  let used = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of work) {
    used += s.w * s.h;
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.w);
    maxY = Math.max(maxY, s.y + s.h);
  }
  const bbox = Math.max(1, (maxX - minX) * (maxY - minY));
  return Math.max(0, Math.min(100, Math.round((used / bbox) * 100)));
}
