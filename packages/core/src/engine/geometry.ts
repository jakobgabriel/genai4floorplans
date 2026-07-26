import type { NoGoZone, Side, Station } from "../model/types";
import { isBlockingZone } from "../model/types";

export interface Point {
  x: number;
  y: number;
}

/** Center point of a station's bounding box (grid units). */
export function center(s: Pick<Station, "x" | "y" | "w" | "h">): Point {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}

/** Rectilinear (Manhattan) distance between two station centers. */
export function rectDist(a: Station, b: Station): number {
  const ca = center(a);
  const cb = center(b);
  return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
}

/** Midpoint of a station's port on the given side (grid units). */
export function portPoint(s: Pick<Station, "x" | "y" | "w" | "h">, side: Side): Point {
  switch (side) {
    case "left":
      return { x: s.x, y: s.y + s.h / 2 };
    case "right":
      return { x: s.x + s.w, y: s.y + s.h / 2 };
    case "top":
      return { x: s.x + s.w / 2, y: s.y };
    case "bottom":
      return { x: s.x + s.w / 2, y: s.y + s.h };
  }
}

/** Absolute occupied cells of a station. Absent/empty mask ⇒ full w×h rectangle.
 *  Offsets outside the bounding box are ignored so resizing w/h stays robust. */
export function stationCells(s: Pick<Station, "x" | "y" | "w" | "h" | "cells">): Array<{ x: number; y: number }> {
  const w = Math.max(1, Math.round(s.w));
  const h = Math.max(1, Math.round(s.h));
  if (s.cells && s.cells.length) {
    const inBounds = s.cells.filter(([dx, dy]) => dx >= 0 && dx < w && dy >= 0 && dy < h);
    if (inBounds.length) return inBounds.map(([dx, dy]) => ({ x: s.x + dx, y: s.y + dy }));
  }
  const out: Array<{ x: number; y: number }> = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: s.x + dx, y: s.y + dy });
  return out;
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

function isShaped(s: Station): boolean {
  return !!(s.cells && s.cells.length);
}

/** True if a unit cell at (cx,cy) lies inside a rectangle. */
function cellInRect(cx: number, cy: number, r: Rect): boolean {
  return cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h;
}

/** True if placing `s` at (x,y) would collide with any other station or no-go zone.
 *  Uses cell-accurate testing when a freeform footprint is involved; otherwise the
 *  fast rectangle path (so all-rectangle models behave exactly as before). */
export function hasCollision(
  s: Station,
  x: number,
  y: number,
  others: Station[],
  zones: NoGoZone[],
): boolean {
  const moved: Station = { ...s, x, y };
  // Only obstacle zones block placement; spacer/aisle/esd merely reserve floor.
  const blocking = zones.filter(isBlockingZone);
  const shaped = isShaped(moved) || others.some(isShaped);
  if (shaped) {
    const mine = stationCells(moved);
    const occupied = new Set(mine.map((c) => c.x + "," + c.y));
    for (const o of others) {
      if (o.id === s.id) continue;
      for (const c of stationCells(o)) if (occupied.has(c.x + "," + c.y)) return true;
    }
    for (const z of blocking) for (const c of mine) if (cellInRect(c.x, c.y, z)) return true;
    return false;
  }
  const r: Rect = { x, y, w: s.w, h: s.h };
  for (const o of others) {
    if (o.id === s.id) continue;
    if (rectsOverlap(r, o)) return true;
  }
  for (const z of blocking) {
    if (rectsOverlap(r, z)) return true;
  }
  return false;
}

/** A station's solid footprint rectangle (grid cells). */
export function footprintRect(s: Pick<Station, "x" | "y" | "w" | "h">): Rect {
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}

/** The footprint expanded by its keep-clear access margins (audit C-03). Absent
 *  clearance ⇒ the footprint itself. Clamped so a margin can't run negative. */
export function clearanceRect(s: Pick<Station, "x" | "y" | "w" | "h" | "clearance">): Rect {
  const c = s.clearance;
  const top = Math.max(0, c?.top ?? 0);
  const right = Math.max(0, c?.right ?? 0);
  const bottom = Math.max(0, c?.bottom ?? 0);
  const left = Math.max(0, c?.left ?? 0);
  return { x: s.x - left, y: s.y - top, w: s.w + left + right, h: s.h + top + bottom };
}

/** True if a's keep-clear zone is blocked by b's solid body (or vice versa).
 *  Two clearance zones may overlap — that is a shared aisle — but a machine body
 *  standing inside another's access margin is a real violation (audit C-03). */
export function clearanceBlocked(
  a: Pick<Station, "x" | "y" | "w" | "h" | "clearance">,
  b: Pick<Station, "x" | "y" | "w" | "h" | "clearance">,
): boolean {
  return rectsOverlap(clearanceRect(a), footprintRect(b)) || rectsOverlap(clearanceRect(b), footprintRect(a));
}

/** Point-in-polygon test (ray casting) for a closed polygon of grid points
 *  (audit C-03 inc2). Points on the boundary count as inside. */
export function pointInPolygon(px: number, py: number, poly: Array<[number, number]>): boolean {
  if (poly.length < 3) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** True when a station footprint lies entirely inside the floor polygon (all
 *  four corners), so the machine sits on usable floor (audit C-03 inc2). An
 *  empty/degenerate polygon means "no envelope declared" → always inside. */
export function footprintInPolygon(s: Pick<Station, "x" | "y" | "w" | "h">, poly: Array<[number, number]>): boolean {
  if (!poly || poly.length < 3) return true;
  const corners: Array<[number, number]> = [
    [s.x + 0.5, s.y + 0.5],
    [s.x + s.w - 0.5, s.y + 0.5],
    [s.x + 0.5, s.y + s.h - 0.5],
    [s.x + s.w - 0.5, s.y + s.h - 0.5],
  ];
  return corners.every(([cx, cy]) => pointInPolygon(cx, cy, poly));
}

/** Clamp a station footprint to stay inside the grid. */
export function clampToGrid(s: Pick<Station, "w" | "h">, x: number, y: number, gridW: number, gridH: number): Point {
  return {
    x: Math.max(0, Math.min(gridW - s.w, x)),
    y: Math.max(0, Math.min(gridH - s.h, y)),
  };
}
