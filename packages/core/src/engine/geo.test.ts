import { describe, it, expect } from "vitest";
import type { Station } from "../model/types";
import { stationCells, portPoint, hasCollision } from "./geometry";
import { STATION_DEFAULTS } from "../model/defaults";

function st(over: Partial<Station> & { id: string }): Station {
  return { ...STATION_DEFAULTS, ...over };
}

describe("stationCells", () => {
  it("returns the full rectangle when no mask is set", () => {
    const s = st({ id: "a", x: 2, y: 3, w: 2, h: 2 });
    expect(stationCells(s)).toHaveLength(4);
  });

  it("honors a freeform mask and ignores out-of-bounds offsets", () => {
    const s = st({ id: "a", x: 0, y: 0, w: 3, h: 3, cells: [[0, 0], [1, 0], [0, 1], [9, 9]] });
    const cells = stationCells(s);
    expect(cells).toHaveLength(3); // the (9,9) offset is outside the 3×3 box
  });
});

describe("portPoint", () => {
  it("maps each side to the bounding-box edge midpoint", () => {
    const s = st({ id: "a", x: 0, y: 0, w: 4, h: 2 });
    expect(portPoint(s, "left")).toEqual({ x: 0, y: 1 });
    expect(portPoint(s, "right")).toEqual({ x: 4, y: 1 });
    expect(portPoint(s, "top")).toEqual({ x: 2, y: 0 });
    expect(portPoint(s, "bottom")).toEqual({ x: 2, y: 2 });
  });
});

describe("hasCollision (shape-aware)", () => {
  it("lets two interlocking L-shapes share a bounding box without colliding", () => {
    // A occupies the left column + bottom row of a 2×2 box at (0,0).
    const a = st({ id: "a", x: 0, y: 0, w: 2, h: 2, cells: [[0, 0], [0, 1], [1, 1]] });
    // B occupies only the top-right cell of a 2×2 box at (0,0) — fits the gap.
    const b = st({ id: "b", x: 0, y: 0, w: 2, h: 2, cells: [[1, 0]] });
    expect(hasCollision(b, 0, 0, [a], [])).toBe(false);
  });

  it("detects overlap when masks share a cell", () => {
    const a = st({ id: "a", x: 0, y: 0, w: 2, h: 2, cells: [[0, 0], [0, 1]] });
    const b = st({ id: "b", x: 0, y: 0, w: 2, h: 2, cells: [[0, 1]] });
    expect(hasCollision(b, 0, 0, [a], [])).toBe(true);
  });

  it("keeps the rectangle fast-path behavior for plain stations", () => {
    const a = st({ id: "a", x: 0, y: 0, w: 2, h: 2 });
    const b = st({ id: "b", x: 5, y: 5, w: 2, h: 2 });
    expect(hasCollision(b, 5, 5, [a], [])).toBe(false);
    expect(hasCollision(b, 1, 1, [a], [])).toBe(true);
  });

  it("only obstacle zones block placement; spacer/aisle reserve without blocking", () => {
    const b = st({ id: "b", x: 0, y: 0, w: 2, h: 2 });
    // A blocking obstacle over the same cells collides.
    expect(hasCollision(b, 0, 0, [], [{ x: 0, y: 0, w: 2, h: 2, kind: "blocking" }])).toBe(true);
    // Legacy no-go zone (no kind ⇒ blocking) still collides.
    expect(hasCollision(b, 0, 0, [], [{ x: 0, y: 0, w: 2, h: 2 }])).toBe(true);
    // A spacer over the same cells does NOT block placement.
    expect(hasCollision(b, 0, 0, [], [{ x: 0, y: 0, w: 2, h: 2, kind: "spacer" }])).toBe(false);
    expect(hasCollision(b, 0, 0, [], [{ x: 0, y: 0, w: 2, h: 2, kind: "aisle" }])).toBe(false);
    // Wall and column are obstacles.
    expect(hasCollision(b, 0, 0, [], [{ x: 0, y: 0, w: 2, h: 2, kind: "wall" }])).toBe(true);
  });
});
