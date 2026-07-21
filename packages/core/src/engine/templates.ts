import type { Model, Station } from "../model/types";
import { cellTopology } from "./topology";
import { clampToGrid } from "./geometry";

export type CellForm = "I" | "U" | "L" | "S";

export interface Slot {
  x: number;
  y: number;
}

type Grid = Pick<Model, "gridW" | "gridH">;

/**
 * Slot positions for `n` movable process steps in the given form.
 *
 * Thin wrapper over engine/topology, which owns the geometry.
 */
export function cellTemplate(form: CellForm, n: number, grid: Grid): Slot[] {
  return cellTopology(form, n, grid).slots;
}

/**
 * Reposition the movable stations into `form`: process steps onto the form's
 * slots, and — crucially — any MOVABLE input/output onto the form's own entry
 * and exit. A form is a flow path whose ends belong to it (a U-cell loads and
 * unloads side by side), so when the incoming/shipping areas are not pinned the
 * whole cell reshapes, not just its middle. Pinned I/O (a fixed dock, an anchored
 * staging bay) stay put. This is the single source of truth shared by the
 * APPLY_TEMPLATE reducer action and the rating/Optimize floor, so the preview
 * and the applied result are identical.
 */
export function applyForm(model: Model, form: CellForm): Station[] {
  const movable = model.stations.filter((s) => s.role === "process" && !s.fixed);
  const topo = cellTopology(form, movable.length, model);
  const place = (s: Station, at: Slot): Station => {
    const { x, y } = clampToGrid(s, at.x, at.y, model.gridW, model.gridH);
    return { ...s, x, y };
  };
  let k = 0;
  return model.stations.map((s) => {
    if (s.fixed) return s;
    if (s.role === "process") {
      const sl = topo.slots[k++];
      return sl ? place(s, sl) : s;
    }
    if (s.role === "input") return place(s, topo.entry);
    if (s.role === "output") return place(s, topo.exit);
    return s;
  });
}
