import type { NoGoZone, Station } from "../model/types";

export interface Point {
  x: number;
  y: number;
}

/** Center point of a station's footprint (grid units). */
export function center(s: Pick<Station, "x" | "y" | "w" | "h">): Point {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}

/** Rectilinear (Manhattan) distance between two station centers. */
export function rectDist(a: Station, b: Station): number {
  const ca = center(a);
  const cb = center(b);
  return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True if two axis-aligned rectangles overlap (touching edges are allowed). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** True if placing `s` at (x,y) would collide with any other station or no-go zone. */
export function hasCollision(
  s: Station,
  x: number,
  y: number,
  others: Station[],
  zones: NoGoZone[],
): boolean {
  const r: Rect = { x, y, w: s.w, h: s.h };
  for (const o of others) {
    if (o.id === s.id) continue;
    if (rectsOverlap(r, o)) return true;
  }
  for (const z of zones) {
    if (rectsOverlap(r, z)) return true;
  }
  return false;
}

/** Clamp a station footprint to stay inside the grid. */
export function clampToGrid(s: Pick<Station, "w" | "h">, x: number, y: number, gridW: number, gridH: number): Point {
  return {
    x: Math.max(0, Math.min(gridW - s.w, x)),
    y: Math.max(0, Math.min(gridH - s.h, y)),
  };
}
