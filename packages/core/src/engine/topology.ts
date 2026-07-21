import type { Model } from "../model/types";
// Declared here rather than imported from ./templates, which now wraps this
// module — importing back would be circular.
export type CellForm = "I" | "U" | "L" | "S" | "W" | "O";
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
//   W  double-U   in ▪ ┐ ▪ ┐ ▪                    an even number of vertical
//                     ▪ │ ▪ │ ▪ out               legs folding down/up, so a long
//                     ▪ ┘ ▪ ┘ ▪                   process packs in with front access
//   O  loop        in ──▶ ▪ ▪ ▪ ┐                 a closed racetrack: material
//                        ▪       ▪                enters and leaves the same open
//                    out ◀── ▪ ▪ ┘                corner, circulating past each once

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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function spread(from: number, to: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [from];
  const step = (to - from) / (count - 1);
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
    const xs = spread(left + GAP, right - GAP, n);
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
    const perLeg = Math.ceil(n / 2);
    const xs = spread(left + GAP, right, perLeg);
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
    const ys = spread(top + H, bottom, vN);
    const slots: Slot[] = ys.map((y) => ({ x: left + GAP, y }));
    if (hN > 0) {
      // Stop short of the edge: the exit needs room beyond the last station.
      const xs = spread(left + GAP + W + 1, right - GAP, hN);
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
    // Double-U / multi-fold: an even number of vertical legs (2 or 4) folding
    // down-then-up, so a long process packs into a compact block with load,
    // unload and every station reachable from the front. Distinct from the U
    // (only 2 legs) and from the S (which runs horizontally, ends opposite).
    const legs = n >= 8 ? 4 : 2;
    const xs = spread(left + GAP, right - GAP, legs);
    const perLeg = Math.ceil(n / legs);
    const down = spread(top + H, bottom, perLeg); // top → bottom
    const slots: Slot[] = [];
    for (let l = 0; l < legs && slots.length < n; l++) {
      // Fold: even legs run down, odd legs run back up.
      const col = l % 2 === 0 ? down : down.slice().reverse();
      for (let i = 0; i < perLeg && slots.length < n; i++) slots.push({ x: xs[l], y: col[i] });
    }
    // Even leg count ⇒ the last leg ends at the top, so both ends face the front.
    return {
      slots,
      entry: { x: xs[0], y: clamp(top - 1, 0, bottom) },
      exit: { x: xs[legs - 1], y: clamp(top - 1, 0, bottom) },
      legs,
      entryExitAdjacent: legs === 2,
    };
  }

  if (form === "O") {
    // Closed loop / racetrack: stations ring a rectangle and material enters and
    // leaves at the same open corner, circulating past each once. Suits carriers
    // or AGVs that must return to the start.
    const x0 = left + GAP;
    const x1 = Math.max(x0 + W, right - GAP);
    const y0 = top;
    const y1 = Math.max(y0 + H, bottom);
    const wSide = Math.max(1, x1 - x0);
    const hSide = Math.max(1, y1 - y0);
    const perim = 2 * (wSide + hSide);
    const slots: Slot[] = [];
    for (let i = 0; i < n; i++) {
      // Walk clockwise from just above the bottom-left; the +0.5 offset keeps a
      // station off the open corner where material enters and leaves.
      const d = ((i + 0.5) / n) * perim;
      let x: number;
      let y: number;
      if (d < hSide) { x = x0; y = Math.round(y1 - d); }
      else if (d < hSide + wSide) { x = Math.round(x0 + (d - hSide)); y = y0; }
      else if (d < 2 * hSide + wSide) { x = x1; y = Math.round(y0 + (d - hSide - wSide)); }
      else { x = Math.round(x1 - (d - 2 * hSide - wSide)); y = y1; }
      slots.push({ x: clamp(x, 0, right), y: clamp(y, 0, bottom) });
    }
    return {
      slots,
      entry: { x: clamp(x0 - GAP, 0, right), y: y1 },
      exit: { x: clamp(x0 - GAP, 0, right), y: clamp(y1 - H, 0, bottom) },
      legs: 4,
      entryExitAdjacent: true,
    };
  }

  // S — serpentine. Rows alternate direction, which is what makes it an S
  // rather than two parallel lines.
  const rows = Math.min(3, Math.max(2, Math.ceil(n / 3)));
  const perRow = Math.ceil(n / rows);
  const ys = spread(top, bottom, rows);
  // Leave a gap at each end for the entry and exit areas.
  const xs = spread(left + GAP, right - GAP, perRow);
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
