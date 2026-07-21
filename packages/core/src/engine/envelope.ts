import type { Model, Station } from "../model/types";
import { isBlockingZone, CELL_AREA_M2 } from "../model/types";
import { clearanceBlocked, footprintInPolygon } from "./geometry";

// Layout realism (audit C-03): the checks that decide whether a layout is
// buildable, not just cheap to flow through. A grid packer with no clearance,
// egress or floor-load model will happily emit a layout no one can install or
// work in. These run continuously and render in place (spec §3 Law 3: invalid
// states are permitted and visible), never blocking the edit.

export type RealismKind = "clearance" | "floor-load" | "egress" | "envelope";

export interface RealismIssue {
  sev: "err" | "warn";
  id: string | null;
  kind: RealismKind;
  msg: string;
}

export interface FloorLoad {
  id: string;
  name: string;
  /** weight ÷ footprint area, kg/m². */
  loadKgPerM2: number;
  capacityKgPerM2: number;
}

export interface LayoutRealism {
  issues: RealismIssue[];
  /** True when no error-level realism issue exists. */
  ok: boolean;
  /** Station-id pairs whose access clearance is blocked by the other's body. */
  clearanceConflicts: Array<[string, string]>;
  /** Stations over the floor-load capacity. */
  overloaded: FloorLoad[];
  /** Process stations with no free path out to the floor boundary. */
  enclosed: string[];
  /** Stations whose footprint leaves the usable floor polygon (C-03 inc2). */
  offFloor: string[];
}

/** Cells a station's solid footprint occupies (integer grid). */
function footprintCells(s: Station): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const w = Math.max(1, Math.round(s.w));
  const h = Math.max(1, Math.round(s.h));
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([s.x + dx, s.y + dy]);
  return out;
}

/**
 * Check a layout for the three realism constraints a flow-only rating ignores.
 * All are gated on data being present, so legacy models (no clearance, no
 * weight, no floor capacity) produce no false positives.
 */
export function layoutRealism(model: Model): LayoutRealism {
  const stations = model.stations;
  const issues: RealismIssue[] = [];
  const clearanceConflicts: Array<[string, string]> = [];
  const overloaded: FloorLoad[] = [];
  const enclosed: string[] = [];
  const offFloor: string[] = [];

  // --- 0. Envelope: every station must sit on the usable floor polygon.
  const poly = model.floorPolygon;
  if (poly && poly.length >= 3) {
    stations.forEach((s) => {
      if (!footprintInPolygon(s, poly)) {
        offFloor.push(s.id);
        issues.push({ sev: "err", id: s.id, kind: "envelope", msg: `${s.name} sits off the usable floor — its footprint leaves the envelope.` });
      }
    });
  }

  // --- 1. Clearance: no machine body inside another's keep-clear access zone.
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i];
      const b = stations[j];
      // Only meaningful when at least one declares clearance.
      if (!a.clearance && !b.clearance) continue;
      if (clearanceBlocked(a, b)) {
        clearanceConflicts.push([a.id, b.id]);
        issues.push({ sev: "err", id: a.id, kind: "clearance", msg: `${a.name} and ${b.name} are too close — one blocks the other's access clearance.` });
      }
    }
  }

  // --- 2. Floor load: station weight over the slab's capacity per m².
  const capacity = model.floorLoadKgPerM2;
  if (capacity && capacity > 0) {
    const cellArea = model.costConfig?.cellAreaM2 ?? CELL_AREA_M2;
    stations.forEach((s) => {
      if (!s.weightKg || s.weightKg <= 0) return;
      const areaM2 = Math.max(1, Math.round(s.w)) * Math.max(1, Math.round(s.h)) * (cellArea > 0 ? cellArea : 1);
      const load = +(s.weightKg / areaM2).toFixed(1);
      if (load > capacity) {
        overloaded.push({ id: s.id, name: s.name, loadKgPerM2: load, capacityKgPerM2: capacity });
        issues.push({ sev: "err", id: s.id, kind: "floor-load", msg: `${s.name} loads the floor at ${load} kg/m², over the ${capacity} kg/m² slab capacity — spread the load or reinforce.` });
      }
    });
  }

  // --- 3. Egress: every process station must reach the floor boundary through
  // free cells. A station boxed in by neighbours (or blocking obstacles) with no
  // walkable path out cannot be serviced or evacuated.
  const gridW = model.gridW;
  const gridH = model.gridH;
  if (gridW > 0 && gridH > 0 && gridW * gridH <= 20000) {
    const occupied = new Set<string>();
    stations.forEach((s) => footprintCells(s).forEach(([x, y]) => occupied.add(x + "," + y)));
    (model.noGoZones ?? []).filter(isBlockingZone).forEach((z) => {
      for (let dy = 0; dy < z.h; dy++) for (let dx = 0; dx < z.w; dx++) occupied.add(z.x + dx + "," + (z.y + dy));
    });
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < gridW && y < gridH && !occupied.has(x + "," + y);

    // Flood free cells reachable from the boundary.
    const reachable = new Set<string>();
    const queue: Array<[number, number]> = [];
    for (let x = 0; x < gridW; x++) {
      [0, gridH - 1].forEach((y) => { if (free(x, y)) { const k = x + "," + y; if (!reachable.has(k)) { reachable.add(k); queue.push([x, y]); } } });
    }
    for (let y = 0; y < gridH; y++) {
      [0, gridW - 1].forEach((x) => { if (free(x, y)) { const k = x + "," + y; if (!reachable.has(k)) { reachable.add(k); queue.push([x, y]); } } });
    }
    while (queue.length) {
      const [x, y] = queue.shift() as [number, number];
      ([[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>).forEach(([nx, ny]) => {
        const k = nx + "," + ny;
        if (free(nx, ny) && !reachable.has(k)) { reachable.add(k); queue.push([nx, ny]); }
      });
    }

    stations.filter((s) => s.role === "process").forEach((s) => {
      // A free cell orthogonally adjacent to the footprint that connects to the
      // boundary means the station can be reached/left.
      let hasEgress = false;
      const w = Math.max(1, Math.round(s.w));
      const h = Math.max(1, Math.round(s.h));
      for (let dx = -1; dx <= w && !hasEgress; dx++) {
        for (const dy of [-1, h]) {
          if (reachable.has(s.x + dx + "," + (s.y + dy))) { hasEgress = true; break; }
        }
      }
      for (let dy = -1; dy <= h && !hasEgress; dy++) {
        for (const dx of [-1, w]) {
          if (reachable.has(s.x + dx + "," + (s.y + dy))) { hasEgress = true; break; }
        }
      }
      if (!hasEgress) {
        enclosed.push(s.id);
        issues.push({ sev: "warn", id: s.id, kind: "egress", msg: `${s.name} is enclosed — no free path to the floor boundary for access or egress.` });
      }
    });
  }

  return {
    issues,
    ok: !issues.some((i) => i.sev === "err"),
    clearanceConflicts,
    overloaded,
    enclosed,
    offFloor,
  };
}
