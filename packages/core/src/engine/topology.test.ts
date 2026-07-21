import { describe, it, expect } from "vitest";
import { cellTopology, entryExitDistance, type TopologyLayout } from "./topology";
import { cellTemplate } from "./templates";
import { generateCandidates } from "./generate";

const GRID = { gridW: 34, gridH: 14 };

/** Distinct y values in flow order — one per leg of the path. */
const rowsOf = (l: TopologyLayout) => [...new Set(l.slots.map((s) => s.y))];

/** +1 when the run moves right, -1 when it moves left. */
function directions(l: TopologyLayout): number[] {
  const byRow = new Map<number, number[]>();
  l.slots.forEach((s) => byRow.set(s.y, (byRow.get(s.y) ?? []).concat(s.x)));
  return [...byRow.values()].map((xs) => (xs[xs.length - 1] >= xs[0] ? 1 : -1));
}

describe("I — a straight line", () => {
  const l = cellTopology("I", 6, GRID);

  it("puts every station on one row", () => {
    expect(rowsOf(l)).toHaveLength(1);
    expect(l.legs).toBe(1);
  });

  it("runs monotonically in one direction", () => {
    const xs = l.slots.map((s) => s.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  it("caps the two ends with entry and exit", () => {
    expect(l.entry.x).toBeLessThan(l.slots[0].x);
    expect(l.exit.x).toBeGreaterThan(l.slots[l.slots.length - 1].x);
    expect(l.entryExitAdjacent).toBe(false);
  });
});

describe("U — a real U, not two parallel lines", () => {
  const l = cellTopology("U", 6, GRID);

  it("has exactly two legs on two rows", () => {
    expect(rowsOf(l)).toHaveLength(2);
    expect(l.legs).toBe(2);
  });

  it("runs out along one leg and back along the other", () => {
    // This is what makes it a U rather than an I repeated twice.
    expect(directions(l)).toEqual([1, -1]);
  });

  it("aligns the two legs on the same columns, so the cell closes", () => {
    const top = l.slots.filter((s) => s.y === l.slots[0].y).map((s) => s.x).sort((a, b) => a - b);
    const bottom = l.slots.filter((s) => s.y !== l.slots[0].y).map((s) => s.x).sort((a, b) => a - b);
    bottom.forEach((x) => expect(top).toContain(x));
  });

  it("turns at the far end from the entry", () => {
    const turnX = Math.max(...l.slots.map((s) => s.x));
    expect(turnX).toBeGreaterThan(l.entry.x);
  });

  it("PUTS ENTRY AND EXIT AT THE SAME END — the defining property", () => {
    // One operator must be able to load and unload without walking the loop.
    expect(l.entry.x).toBe(l.exit.x);
    expect(l.entry.y).not.toBe(l.exit.y);
    expect(l.entryExitAdjacent).toBe(true);
    expect(entryExitDistance(l)).toBeLessThan(GRID.gridW / 2);
  });

  it("is a shorter round trip than a straight line of the same station count", () => {
    // If the U were laid out with shipping at the far right, the return leg
    // would be cancelled out and this would not hold.
    expect(entryExitDistance(l)).toBeLessThan(entryExitDistance(cellTopology("I", 6, GRID)));
  });

  it("keeps both legs populated for an odd station count", () => {
    const odd = cellTopology("U", 5, GRID);
    expect(rowsOf(odd)).toHaveLength(2);
    expect(odd.slots).toHaveLength(5);
  });
});

describe("L — one right-angle bend", () => {
  const l = cellTopology("L", 6, GRID);

  it("has a vertical run and a horizontal run", () => {
    const vertical = l.slots.filter((s) => s.x === l.slots[0].x);
    expect(vertical.length).toBeGreaterThan(1);
    const horizontal = l.slots.filter((s) => s.y === l.slots[l.slots.length - 1].y);
    expect(horizontal.length).toBeGreaterThan(1);
    expect(l.legs).toBe(2);
  });

  it("descends the vertical leg then runs right along the bottom", () => {
    const vertical = l.slots.filter((s) => s.x === l.slots[0].x).map((s) => s.y);
    for (let i = 1; i < vertical.length; i++) expect(vertical[i]).toBeGreaterThan(vertical[i - 1]);
  });

  it("enters from above and leaves to the side, not both from the left", () => {
    expect(l.entry.y).toBeLessThan(l.slots[0].y);
    expect(l.exit.x).toBeGreaterThan(l.slots[l.slots.length - 1].x);
  });
});

describe("S — serpentine, alternating rows", () => {
  const l = cellTopology("S", 9, GRID);

  it("uses three rows for nine stations", () => {
    expect(rowsOf(l)).toHaveLength(3);
    expect(l.legs).toBe(3);
  });

  it("REVERSES DIRECTION EVERY ROW", () => {
    // Rows all running the same way is two parallel lines, and the flow would
    // have to jump the full cell width between them.
    expect(directions(l)).toEqual([1, -1, 1]);
  });

  it("never jumps the full width between consecutive stations", () => {
    const span = Math.max(...l.slots.map((s) => s.x)) - Math.min(...l.slots.map((s) => s.x));
    for (let i = 1; i < l.slots.length; i++) {
      expect(Math.abs(l.slots[i].x - l.slots[i - 1].x)).toBeLessThan(span);
    }
  });
});

describe("W — double-U, folds into vertical legs", () => {
  const l = cellTopology("W", 12, GRID);

  it("uses four vertical legs for a long process", () => {
    expect(l.legs).toBe(4);
    expect([...new Set(l.slots.map((s) => s.x))]).toHaveLength(4);
  });

  it("folds down then up between legs, never jumping the full height", () => {
    const span = Math.max(...l.slots.map((s) => s.y)) - Math.min(...l.slots.map((s) => s.y));
    for (let i = 1; i < l.slots.length; i++) {
      expect(Math.abs(l.slots[i].y - l.slots[i - 1].y)).toBeLessThanOrEqual(span);
    }
  });

  it("brings both ends to the front (top) for one-side access", () => {
    expect(l.entry.y).toBeLessThanOrEqual(l.slots[0].y);
    expect(l.exit.y).toBeLessThanOrEqual(Math.min(...l.slots.map((s) => s.y)) + 1);
  });

  it("places every station on a distinct cell (no overlaps)", () => {
    expect(new Set(l.slots.map((s) => `${s.x},${s.y}`)).size).toBe(l.slots.length);
  });
});

describe("O — a closed loop / racetrack", () => {
  const l = cellTopology("O", 10, GRID);

  it("rings the stations around a rectangle (all four sides used)", () => {
    const xs = new Set(l.slots.map((s) => s.x));
    const ys = new Set(l.slots.map((s) => s.y));
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
    expect(new Set(l.slots.map((s) => `${s.x},${s.y}`)).size).toBe(l.slots.length);
  });

  it("enters and leaves at the same open mouth — the defining loop property", () => {
    // Near-zero gap between entry and exit is what makes it a loop, not a line.
    expect(entryExitDistance(l)).toBeLessThanOrEqual(entryExitDistance(cellTopology("U", 10, GRID)));
    expect(l.entryExitAdjacent).toBe(true);
  });
});

describe("the legacy APPLY_TEMPLATE path serpentines too", () => {
  it("reverses the second row for S", () => {
    const s = cellTemplate("S", 6, GRID);
    const top = s.filter((p) => p.y === s[0].y).map((p) => p.x);
    const bottom = s.filter((p) => p.y !== s[0].y).map((p) => p.x);
    expect(top[top.length - 1]).toBeGreaterThan(top[0]);
    expect(bottom[bottom.length - 1]).toBeLessThan(bottom[0]);
  });
});

describe("generated cells honour their declared form", () => {
  const cands = generateCandidates({
    name: "T",
    annualVolume: 120000,
    annualShifts: 460,
    shiftHours: 8,
    steps: [
      { name: "Load blank" },
      { name: "Press form" },
      { name: "MIG weld" },
      { name: "Deburr" },
      { name: "Leak test" },
      { name: "Pack" },
    ],
  });

  const procsOf = (id: string) => {
    const c = cands.find((x) => x.id === id);
    return { c, procs: (c?.model.stations ?? []).filter((s) => s.role === "process") };
  };

  it("places a U-form cell's incoming and shipping at the same end", () => {
    const u = cands.find((c) => c.form === "U");
    if (!u) return;
    const inS = u.model.stations.find((s) => s.role === "input")!;
    const outS = u.model.stations.find((s) => s.role === "output")!;
    // Same column, different row — load and unload side by side.
    expect(inS.x).toBe(outS.x);
    expect(inS.y).not.toBe(outS.y);
  });

  it("places an I-form cell's incoming and shipping at opposite ends", () => {
    const i = cands.find((c) => c.form === "I");
    if (!i) return;
    const inS = i.model.stations.find((s) => s.role === "input")!;
    const outS = i.model.stations.find((s) => s.role === "output")!;
    expect(outS.x).toBeGreaterThan(inS.x);
  });

  it("spreads a U-form's stations over two rows", () => {
    const { procs } = procsOf("cell-U");
    if (procs.length < 2) return;
    expect(new Set(procs.map((s) => s.y)).size).toBe(2);
  });

  it("keeps every station inside the grid and clear of the others", () => {
    cands.forEach((c) => {
      c.model.stations.forEach((s) => {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(c.model.gridW);
        expect(s.y + s.h).toBeLessThanOrEqual(c.model.gridH);
      });
    });
  });
});
