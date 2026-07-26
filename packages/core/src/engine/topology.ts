import type { Model } from "../model/types";
// Declared here rather than imported from ./templates, which now wraps this
// module — importing back would be circular.
export type CellForm = "I" | "U" | "L" | "S" | "W" | "P" | "C" | "O";
export interface Slot {
  x: number;
  y: number;
}

// Cell topology (spec §3.5 `topology`, §8 "new cell topology = template + path
// generator").
//
// A form is not just a set of positions — it is a *flow path*, and the entry and
// exit belong to the form. Placing incoming at the far left and shipping at the
// far right regardless of form is what makes a "U-cell" not a U-cell: the part
// travels out along the top leg, back along the bottom, and then has to cross
// the whole cell again to reach shipping. The return leg — the entire point of a
// U — is cancelled out.
//
// So each form declares where material enters and leaves:
//
//   I  straight   in ──▶ ▪ ▪ ▪ ▪ ──▶ out          entry and exit at opposite ends
//   U  u-cell     in ──▶ ▪ ▪ ▪ ┐                  entry and exit ADJACENT,
//                 out ◀── ▪ ▪ ▪ ┘                  turn at the far end
//   L  el-cell    in ──▶ ▪                        one right-angle bend
//                        ▪ ▪ ▪ ──▶ out
//   S  serpentine in ──▶ ▪ ▪ ▪ ┐                  alternating rows
//                       ┌ ▪ ▪ ▪ ┘
//                       └ ▪ ▪ ▪ ──▶ out

export interface TopologyLayout {
  /** Process-station slots, in flow order. */
  slots: Slot[];
  /** Where the incoming/staging area belongs for this form. */
  entry: Slot;
  /** Where the outgoing/shipping area belongs for this form. */
  exit: Slot;
  /** Straight runs in the path. I=1, L=2, U=2, S=rows. */
  legs: number;
  /** True when entry and exit sit at the same end — the U-cell property. */
  entryExitAdjacent: boolean;
}

type Grid = Pick<Model, "gridW" | "gridH">;

/** Station footprint the templates lay out against. */
const W = 3;
const H = 2;
/** Gap between a leg's end and its entry/exit area. */
const GAP = 4;
/** Centre-to-centre spacing of neighbouring stations along a leg. */
const PITCH_X = W + 1;
const PITCH_Y = H + 1;
/** A workshop's islands stand apart — that separation is the whole point. */
const ISLAND_X = W + 5;
const ISLAND_Y = H + 3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Positions for `count` stations along a run, at a real pitch.
 *
 * This replaced `spread(from, to, count)`, which distributed the stations
 * evenly across the whole available span whatever the count. Two things came
 * out of that, and both were wrong:
 *
 *  - The path length did not depend on the station count. A straight line of
 *    three stations and one of nine measured exactly the same, because both
 *    filled the same band. Transport cost is distance × volume, so every form
 *    scored a constant, and the constant was lowest for the straight line by
 *    construction. That, not any manufacturing truth, is why I-form won every
 *    comparison.
 *  - At high counts the spacing fell below the station width and the stations
 *    overlapped each other.
 *
 * A pitch is what a real layout has: stations sit a fixed distance apart and
 * the cell is as long as it needs to be. Compression only happens when the run
 * genuinely does not fit, and it stops at the station width rather than going
 * through it.
 */
function run(from: number, to: number, count: number, pitch: number, minPitch: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [from];
  const span = Math.max(0, to - from);
  const step = (count - 1) * pitch <= span ? pitch : Math.max(minPitch, span / (count - 1));
  return Array.from({ length: count }, (_, i) => Math.round(from + step * i));
}

/**
 * Lay out `n` process stations in the given form, plus the entry and exit that
 * belong to that form.
 *
 * Coordinates are grid cells. The caller is responsible for keeping the whole
 * result inside its own margins.
 */
export function cellTopology(form: CellForm, n: number, grid: Grid): TopologyLayout {
  const left = 1;
  const right = Math.max(left + W, grid.gridW - W - 1);
  const top = 1;
  const bottom = Math.max(top + H, grid.gridH - H - 1);
  const midY = Math.max(top, Math.round(grid.gridH / 2 - H / 2));

  const empty: TopologyLayout = {
    slots: [],
    entry: { x: left, y: midY },
    exit: { x: right, y: midY },
    legs: 0,
    entryExitAdjacent: false,
  };
  if (n <= 0) return empty;

  if (form === "I") {
    // Single straight run. Entry and exit cap the two ends.
    const xs = run(left + GAP, right - GAP, n, PITCH_X, W);
    const slots = xs.map((x) => ({ x, y: midY }));
    return {
      slots,
      entry: { x: clamp(xs[0] - GAP, 0, right), y: midY },
      exit: { x: clamp(xs[xs.length - 1] + GAP, 0, right), y: midY },
      legs: 1,
      entryExitAdjacent: false,
    };
  }

  if (form === "U") {
    // Two parallel legs sharing the same columns, so the cell closes properly.
    // Outbound along the top, inbound along the bottom, turn at the right.
    // Each leg runs at the same pitch as a straight line, so a U of n stations
    // is a horseshoe half as long as the I — not two full-width runs, which is
    // what filling the grid used to produce.
    const perLeg = Math.ceil(n / 2);
    const xs = run(left + GAP, right - GAP, perLeg, PITCH_X, W);
    const slots: Slot[] = [];
    for (let i = 0; i < perLeg && slots.length < n; i++) slots.push({ x: xs[i], y: top });
    for (let i = 0; slots.length < n; i++) slots.push({ x: xs[perLeg - 1 - i], y: bottom });

    // The defining property: load and unload sit side by side at the open end,
    // so one operator can serve both without walking the loop.
    return {
      slots,
      entry: { x: clamp(xs[0] - GAP, 0, right), y: top },
      exit: { x: clamp(xs[0] - GAP, 0, right), y: bottom },
      legs: 2,
      entryExitAdjacent: true,
    };
  }

  if (form === "L") {
    // A vertical run down the left, then a horizontal run along the bottom.
    const vN = Math.max(1, Math.ceil(n / 2));
    const hN = n - vN;
    const ys = run(top + H, bottom, vN, PITCH_Y, H);
    const slots: Slot[] = ys.map((y) => ({ x: left + GAP, y }));
    if (hN > 0) {
      // Stop short of the edge: the exit needs room beyond the last station.
      const xs = run(left + GAP + PITCH_X, right - GAP, hN, PITCH_X, W);
      xs.forEach((x) => slots.push({ x, y: bottom }));
    }
    const last = slots[slots.length - 1];
    return {
      slots,
      // Enters from above the top of the vertical leg.
      entry: { x: left + GAP, y: clamp(ys[0] - H - 1, 0, bottom) },
      // Leaves past the end of the horizontal leg (or below it if there is none).
      exit: hN > 0 ? { x: clamp(last.x + GAP, 0, right), y: bottom } : { x: clamp(last.x + GAP, 0, right), y: last.y },
      legs: 2,
      entryExitAdjacent: false,
    };
  }

  if (form === "W") {
    // Workshop — a functional layout, not a cell.
    //
    // Machines stand grouped by process with aisles between them, and parts
    // move between groups in batches rather than one at a time. There is no
    // flow path to lay out: the defining property is that the stations are
    // SEPARATED, so the distance between consecutive operations is long and
    // stays long however the work is sequenced.
    //
    // Laid out as islands on a coarse grid. Consecutive slots are deliberately
    // not adjacent — the transport cost that falls out of that separation is
    // the job shop's real penalty, and it is what the flow-oriented forms are
    // being compared against.
    const cols = Math.max(1, Math.min(Math.ceil(Math.sqrt(n)), Math.floor((right - left - GAP) / ISLAND_X) || 1));
    const rowsN = Math.max(1, Math.ceil(n / cols));
    const xs = run(left + GAP, right - GAP, cols, ISLAND_X, W);
    const ys = run(top, bottom, rowsN, ISLAND_Y, H);
    const slots: Slot[] = [];
    for (let r = 0; r < rowsN && slots.length < n; r++) {
      for (let c = 0; c < cols && slots.length < n; c++) slots.push({ x: xs[c], y: ys[r] });
    }
    // Goods in on the near side, goods out past the last island. Stacking both
    // on the dock wall put them on the same cell whenever the shop came out as
    // a single row, which is exactly what a one-station job shop is.
    const last = slots[slots.length - 1];
    return {
      slots,
      entry: { x: clamp(xs[0] - GAP, 0, right), y: ys[0] },
      exit: { x: clamp(last.x + GAP, 0, right), y: last.y },
      legs: rowsN,
      // Nothing here helps an operator close a loop: there is no cell to stand in.
      entryExitAdjacent: false,
    };
  }

  if (form === "P") {
    // Parallel lines — two straight runs flowing the SAME direction, not a
    // snake. This is the high-volume answer: duplicate the line to double the
    // rate (or carry a second model) rather than lengthen it. Incoming splits
    // to both lines at the left; shipping merges them at the right.
    const perLine = Math.ceil(n / 2);
    const xs = run(left + GAP, right - GAP, perLine, PITCH_X, W);
    const yTop = Math.max(top, midY - PITCH_Y);
    const yBot = Math.min(bottom, midY + PITCH_Y);
    const slots: Slot[] = [];
    for (let i = 0; i < perLine && slots.length < n; i++) slots.push({ x: xs[i], y: yTop });
    for (let i = 0; i < perLine && slots.length < n; i++) slots.push({ x: xs[i], y: yBot });
    return {
      slots,
      entry: { x: clamp(xs[0] - GAP, 0, right), y: midY },
      exit: { x: clamp(xs[xs.length - 1] + GAP, 0, right), y: midY },
      legs: 2,
      entryExitAdjacent: false,
    };
  }

  if (form === "C") {
    // Comb / spine — a central feed line with stations hung alternately above
    // and below it, the way mixed-model assembly branches sub-assembly feeders
    // off a main spine. The flow runs straight along the spine; the branches
    // are what keep the feeders off the critical path.
    const xs = run(left + GAP, right - GAP, n, PITCH_X, W);
    const above = Math.max(top, midY - PITCH_Y);
    const below = Math.min(bottom, midY + PITCH_Y);
    const slots = xs.map((x, i) => ({ x, y: i % 2 === 0 ? above : below }));
    return {
      slots,
      entry: { x: clamp(xs[0] - GAP, 0, right), y: midY },
      exit: { x: clamp(xs[xs.length - 1] + GAP, 0, right), y: midY },
      legs: 1,
      entryExitAdjacent: false,
    };
  }

  if (form === "O") {
    // Closed loop — stations set around a rectangular circuit, the way a rotary
    // cell or a loop conveyor runs. Load and unload sit together on the open
    // (left) side, so the part comes back to where it started: the loop's
    // defining property, shared with the U but around four legs, not two.
    const perTop = Math.max(1, Math.ceil(n / 3));
    const perRight = Math.max(0, Math.ceil((n - perTop) / 2));
    const perBot = Math.max(0, n - perTop - perRight);
    const xsTop = run(left + GAP, right - GAP, perTop, PITCH_X, W);
    const ysRight = run(top + H, bottom - H, Math.max(1, perRight), PITCH_Y, H);
    const xsBot = run(left + GAP, right - GAP, Math.max(1, perBot), PITCH_X, W);
    const slots: Slot[] = [];
    for (let i = 0; i < perTop && slots.length < n; i++) slots.push({ x: xsTop[i], y: top });
    for (let i = 0; i < perRight && slots.length < n; i++) slots.push({ x: right, y: ysRight[i] });
    for (let i = perBot - 1; i >= 0 && slots.length < n; i--) slots.push({ x: xsBot[i], y: bottom });
    return {
      slots,
      entry: { x: left, y: clamp(midY - Math.round(PITCH_Y / 2), 0, bottom) },
      exit: { x: left, y: clamp(midY + Math.round(PITCH_Y / 2), 0, bottom) },
      legs: 4,
      entryExitAdjacent: true,
    };
  }

  // S — serpentine. Rows alternate direction, which is what makes it an S
  // rather than two parallel lines.
  const rows = Math.min(3, Math.max(2, Math.ceil(n / 3)));
  const perRow = Math.ceil(n / rows);
  const ys = run(top, bottom, rows, PITCH_Y, H);
  // Leave a gap at each end for the entry and exit areas.
  const xs = run(left + GAP, right - GAP, perRow, PITCH_X, W);
  const slots: Slot[] = [];
  for (let r = 0; r < rows && slots.length < n; r++) {
    // Reverse every other row: the flow snakes back on itself.
    const rowXs = r % 2 === 0 ? xs : xs.slice().reverse();
    for (let c = 0; c < perRow && slots.length < n; c++) slots.push({ x: rowXs[c], y: ys[r] });
  }
  const last = slots[slots.length - 1];
  const endsLeft = last.x <= (left + GAP + right) / 2;
  return {
    slots,
    entry: { x: clamp(xs[0] - GAP, 0, right), y: ys[0] },
    exit: { x: endsLeft ? clamp(last.x - GAP, 0, right) : clamp(last.x + GAP, 0, right), y: last.y },
    legs: rows,
    entryExitAdjacent: false,
  };
}

/**
 * Rectilinear path length through the whole cell, entry → stations → exit.
 *
 * The check that a form is genuinely being followed: a U must be materially
 * shorter than a straight line over the same station count, because the return
 * leg brings the exit back to the entry. If it is not, the form is decorative.
 */
export function pathLength(layout: TopologyLayout): number {
  const pts = [layout.entry, ...layout.slots, layout.exit];
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
  }
  return d;
}

/** Distance between the entry and the exit — near zero for a true U-cell. */
export function entryExitDistance(layout: TopologyLayout): number {
  return Math.abs(layout.entry.x - layout.exit.x) + Math.abs(layout.entry.y - layout.exit.y);
}
