import type { Model } from "../model/types";

export type CellForm = "I" | "U" | "L" | "S";

export interface Slot {
  x: number;
  y: number;
}

type Grid = Pick<Model, "gridW" | "gridH">;

// Standard cell-form templates (I, U, L, S). Returns slot positions for the
// given number of movable process steps. Ported from the demo.
export function cellTemplate(form: CellForm, n: number, grid: Grid): Slot[] {
  const slots: Slot[] = [];
  const top = 2;
  const bottom = grid.gridH - 4;
  const left = 2;
  const right = grid.gridW - 4;
  if (n <= 0) return slots;
  if (form === "I") {
    const step = (right - left) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) slots.push({ x: Math.round(left + step * i), y: Math.round(grid.gridH / 2 - 1) });
  } else if (form === "U") {
    const half = Math.ceil(n / 2);
    const sx = (right - left) / Math.max(1, half - 1);
    for (let a = 0; a < half; a++) slots.push({ x: Math.round(left + sx * a), y: top });
    for (let b = half; b < n; b++) slots.push({ x: Math.round(right - sx * (b - half)), y: bottom });
  } else if (form === "L") {
    const vN = Math.ceil(n / 2);
    const hN = n - vN;
    const sy = (bottom - top) / Math.max(1, vN - 1);
    for (let c = 0; c < vN; c++) slots.push({ x: left, y: Math.round(top + sy * c) });
    const sxx = (right - left) / Math.max(1, hN);
    for (let d = 0; d < hN; d++) slots.push({ x: Math.round(left + sxx * (d + 1)), y: bottom });
  } else if (form === "S") {
    const per = Math.ceil(n / 2);
    const sX = (right - left) / Math.max(1, per - 1);
    for (let e = 0; e < per; e++) slots.push({ x: Math.round(left + sX * e), y: top });
    for (let g = per; g < n; g++) slots.push({ x: Math.round(left + sX * (g - per)), y: bottom });
  }
  return slots;
}
