import type { Flow, Model, Station } from "../model/types";
import { computeKPIs } from "./kpis";
import { hasCollision } from "./geometry";

/** A station footprint fits entirely inside the grid (audit C-05). Swapping the
 *  positions of two differently sized stations can push the larger one off the
 *  grid — hasCollision catches overlaps but not out-of-bounds, so this is
 *  checked separately. */
function withinGrid(s: Pick<Station, "x" | "y" | "w" | "h">, grid: Grid): boolean {
  return s.x >= 0 && s.y >= 0 && s.x + s.w <= grid.gridW && s.y + s.h <= grid.gridH;
}

type Grid = Pick<Model, "gridW" | "gridH"> & { noGoZones?: Model["noGoZones"] };

export interface OptimizeOptions {
  /** Reject candidate swaps that would overlap a station or no-go zone. */
  avoidCollisions?: boolean;
  /** Number of randomized restarts after the greedy pass (0 = deterministic). */
  restarts?: number;
}

function cloneStations(stations: Station[]): Station[] {
  return stations.map((s) => ({ ...s }));
}

// Greedy pairwise position-swap of movable stations, minimizing flow cost.
// This is a local floor, not a global optimum (spec §9). Optionally rejects
// swaps that create footprint collisions or violate no-go zones (Phase 4),
// and can run randomized restarts to escape weak local minima.
function greedyPass(
  start: Station[],
  flows: Flow[],
  grid: Grid,
  zones: Model["noGoZones"],
  avoidCollisions: boolean,
): { stations: Station[]; cost: number } {
  let best = cloneStations(start);
  let bestCost = computeKPIs(best, flows, grid).flowCost;
  const movable: number[] = [];
  best.forEach((s, i) => {
    if (!s.fixed) movable.push(i);
  });
  let improved = true;
  let guard = 0;
  while (improved && guard < 300) {
    improved = false;
    guard++;
    for (let a = 0; a < movable.length; a++) {
      for (let b = a + 1; b < movable.length; b++) {
        const i = movable[a];
        const j = movable[b];
        const trial = cloneStations(best);
        const tx = trial[i].x;
        const ty = trial[i].y;
        trial[i].x = trial[j].x;
        trial[i].y = trial[j].y;
        trial[j].x = tx;
        trial[j].y = ty;
        // Reject a swap that pushes either footprint off the grid — a larger
        // station taking a smaller one's edge slot would otherwise leave the
        // floor (audit C-05).
        if (!withinGrid(trial[i], grid) || !withinGrid(trial[j], grid)) continue;
        if (avoidCollisions) {
          const others = trial.filter((_, k) => k !== i && k !== j);
          if (
            hasCollision(trial[i], trial[i].x, trial[i].y, others.concat(trial[j]), zones) ||
            hasCollision(trial[j], trial[j].x, trial[j].y, others.concat(trial[i]), zones)
          ) {
            continue;
          }
        }
        const c = computeKPIs(trial, flows, grid).flowCost;
        if (c < bestCost - 1e-9) {
          best = trial;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return { stations: best, cost: bestCost };
}

// Deterministic shuffle of movable station positions, seeded so restarts are
// reproducible (keeps the engine fully deterministic for the default config).
function shuffleMovable(stations: Station[], seed: number): Station[] {
  const out = cloneStations(stations);
  const movable = out.filter((s) => !s.fixed);
  const slots = movable.map((s) => ({ x: s.x, y: s.y }));
  let r = seed * 2654435761;
  for (let i = slots.length - 1; i > 0; i--) {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    const j = r % (i + 1);
    const t = slots[i];
    slots[i] = slots[j];
    slots[j] = t;
  }
  let k = 0;
  for (const s of out) {
    if (!s.fixed) {
      s.x = slots[k].x;
      s.y = slots[k].y;
      k++;
    }
  }
  return out;
}

export function optimize(
  stations: Station[],
  flows: Flow[],
  grid: Grid,
  opts: OptimizeOptions = {},
): Station[] {
  const avoidCollisions = opts.avoidCollisions ?? true;
  const restarts = opts.restarts ?? 0;
  const zones = grid.noGoZones ?? [];
  let { stations: best, cost: bestCost } = greedyPass(stations, flows, grid, zones, avoidCollisions);
  for (let r = 0; r < restarts; r++) {
    const seeded = shuffleMovable(stations, r + 1);
    const res = greedyPass(seeded, flows, grid, zones, avoidCollisions);
    if (res.cost < bestCost - 1e-9) {
      best = res.stations;
      bestCost = res.cost;
    }
  }
  return best;
}
