import type { Model } from "../model/types";
import { cellTopology } from "./topology";

export type CellForm = "I" | "U" | "L" | "S";

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
