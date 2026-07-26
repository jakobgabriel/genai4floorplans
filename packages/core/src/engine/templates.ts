import type { Model } from "../model/types";
import { cellTopology } from "./topology";

export type CellForm = "I" | "U" | "L" | "S" | "W" | "P" | "C" | "O";

export interface Slot {
  x: number;
  y: number;
}

type Grid = Pick<Model, "gridW" | "gridH">;

/**
 * Slot positions for `n` movable process steps in the given form.
 *
 * Thin wrapper over engine/topology, which owns the geometry. Kept because
 * APPLY_TEMPLATE repositions *existing* stations and has no use for the entry
 * and exit that the topology also computes.
 */
export function cellTemplate(form: CellForm, n: number, grid: Grid): Slot[] {
  return cellTopology(form, n, grid).slots;
}

/** What each form is called where a planner reads it. */
export const FORM_LABELS: Record<CellForm, string> = {
  I: "Straight line",
  U: "U-cell",
  L: "L-cell",
  S: "Serpentine",
  W: "Workshop",
  P: "Parallel lines",
  C: "Spine (comb)",
  O: "Loop",
};
