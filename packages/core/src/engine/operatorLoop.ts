import type { Model, Station } from "../model/types";
import { CELL_SIZE_M, DEFAULT_WALK_SPEED_MPS, attendedFractionOf, isFlowFunction, partsPerCycleOf } from "../model/types";
import { rectDist } from "./geometry";
import { topoOrder } from "./dag";
import { effectiveCycleSec } from "./cycle";
import { customerTaktSec } from "./takt";

// Operator loops (spec §13, audit C-13) — the layout ∩ lean feature. An operator
// tending several stations (chaku-chaku / multi-machine tending) walks between
// them, and that WALK is waste computed from the layout geometry, not typed. The
// loop's time is the operator's attended work plus the walk; measured against
// takt it shows whether one operator can keep up, and the walk share is the
// walking waste a better layout removes.

export interface OperatorLoop {
  /** operatorId for an explicit loop; a synthetic id otherwise. */
  id: string;
  /** Member stations, in walking order. */
  stationIds: string[];
  stationNames: string[];
  /** Operator-bound work seconds per part (Σ cycle × attendedFraction ÷ ppc). */
  workSec: number;
  /** Walking seconds per part around the (cyclic) loop, from the layout. */
  walkSec: number;
  walkMeters: number;
  /** workSec + walkSec — the operator's time per part. */
  loopSec: number;
  /** loopSec ÷ takt, %. 0 when takt is unknown. */
  utilizationPct: number;
  /** loopSec − takt when over takt, else 0. */
  overTaktSec: number;
  /** True for the notional "one operator walks the whole line" loop shown when
   *  no station is explicitly assigned. */
  synthetic: boolean;
}

export interface OperatorLoopAnalysis {
  loops: OperatorLoop[];
  takt: number;
  walkSpeedMps: number;
  /** Number of operator loops (= operators walking). */
  operatorCount: number;
  totalWalkSec: number;
  totalWorkSec: number;
  /** Walking share of all operator time — the walking waste (%). */
  walkWastePct: number;
  /** Loop ids that exceed takt (the operator cannot keep up). */
  overloaded: string[];
  /** True when no station declares an operatorId — the single synthetic loop. */
  notional: boolean;
}

const EMPTY: OperatorLoopAnalysis = {
  loops: [],
  takt: 0,
  walkSpeedMps: DEFAULT_WALK_SPEED_MPS,
  operatorCount: 0,
  totalWalkSec: 0,
  totalWorkSec: 0,
  walkWastePct: 0,
  overloaded: [],
  notional: false,
};

/** Operator-bound work seconds per part at a station. */
function attendedPerPart(s: Station): number {
  const ppc = partsPerCycleOf(s);
  return (effectiveCycleSec(s) * attendedFractionOf(s)) / Math.max(1, ppc);
}

/** Walking metres around a cyclic loop of stations (returns to the first —
 *  a chaku-chaku loop is a round trip). Distance is rectilinear between station
 *  centres, converted from grid cells to metres. */
function loopMeters(stations: Station[]): number {
  if (stations.length < 2) return 0;
  let cells = 0;
  for (let i = 0; i < stations.length; i++) {
    const a = stations[i];
    const b = stations[(i + 1) % stations.length];
    cells += rectDist(a, b);
  }
  return cells * CELL_SIZE_M;
}

export function analyseOperatorLoops(model: Model): OperatorLoopAnalysis {
  const proc = model.stations.filter((s) => s.role === "process" && !isFlowFunction(s));
  if (proc.length === 0) return EMPTY;

  const takt = customerTaktSec(model);
  const walkSpeed = model.walkSpeedMps && model.walkSpeedMps > 0 ? model.walkSpeedMps : DEFAULT_WALK_SPEED_MPS;

  // Flow order, so a loop's members walk in process sequence.
  const order = topoOrder(model.stations, model.flows);
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const byOrder = (a: Station, b: Station) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);

  const explicit = proc.filter((s) => s.operatorId);
  const groups: Array<{ id: string; members: Station[]; synthetic: boolean }> = [];
  let notional = false;

  if (explicit.length === 0) {
    // No assignment: one notional operator walking the whole process chain — a
    // pure layout indicator of walking waste, zero setup required.
    notional = true;
    groups.push({ id: "all", members: proc.slice().sort(byOrder), synthetic: true });
  } else {
    const byOp = new Map<string, Station[]>();
    explicit.forEach((s) => {
      const arr = byOp.get(s.operatorId as string) ?? [];
      arr.push(s);
      byOp.set(s.operatorId as string, arr);
    });
    [...byOp.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([id, members]) => {
      groups.push({ id, members: members.slice().sort(byOrder), synthetic: false });
    });
    // Unassigned but operator-bound stations become their own singleton loops so
    // their manning is still visible; fully unattended machines need no operator.
    proc
      .filter((s) => !s.operatorId && attendedPerPart(s) > 1e-9)
      .sort(byOrder)
      .forEach((s) => groups.push({ id: s.id, members: [s], synthetic: false }));
  }

  const loops: OperatorLoop[] = groups.map((g) => {
    const workSec = +g.members.reduce((a, s) => a + attendedPerPart(s), 0).toFixed(2);
    const walkMeters = +loopMeters(g.members).toFixed(2);
    const walkSec = +(walkMeters / walkSpeed).toFixed(2);
    const loopSec = +(workSec + walkSec).toFixed(2);
    return {
      id: g.id,
      stationIds: g.members.map((s) => s.id),
      stationNames: g.members.map((s) => s.name),
      workSec,
      walkSec,
      walkMeters,
      loopSec,
      utilizationPct: takt > 0 ? +((loopSec / takt) * 100).toFixed(1) : 0,
      overTaktSec: takt > 0 ? +Math.max(0, loopSec - takt).toFixed(2) : 0,
      synthetic: g.synthetic,
    };
  });

  const totalWalkSec = +loops.reduce((a, l) => a + l.walkSec, 0).toFixed(2);
  const totalWorkSec = +loops.reduce((a, l) => a + l.workSec, 0).toFixed(2);
  const denom = totalWalkSec + totalWorkSec;

  return {
    loops,
    takt,
    walkSpeedMps: walkSpeed,
    operatorCount: loops.length,
    totalWalkSec,
    totalWorkSec,
    walkWastePct: denom > 0 ? +((totalWalkSec / denom) * 100).toFixed(1) : 0,
    overloaded: loops.filter((l) => l.overTaktSec > 0).map((l) => l.id),
    notional,
  };
}
