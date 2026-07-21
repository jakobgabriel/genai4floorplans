import { describe, it, expect } from "vitest";
import { generateCandidates, type GenerateBrief } from "./generate";
import { applyForm } from "./templates";
import { cellTopology } from "./topology";
import type { Model } from "../model/types";

const BRIEF: GenerateBrief = {
  useCase: "assembly",
  annualVolume: 120_000,
  shiftHours: 8,
  steps: [
    { name: "Cut", cycleTimeSec: 30 },
    { name: "Weld", cycleTimeSec: 45 },
    { name: "Assemble", cycleTimeSec: 40 },
    { name: "Test", cycleTimeSec: 25 },
  ],
};

// A generated layout is a starting point, not a constraint. The generator cannot
// know which areas are truly anchored, so incoming/shipping must come out
// MOVABLE — that is what lets the optimiser (and the planner) reshape the cell.
describe("generated layouts are flexible", () => {
  it("emits movable input/output areas (nothing pinned)", () => {
    const cands = generateCandidates(BRIEF);
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      const io = c.model.stations.filter((s) => s.role === "input" || s.role === "output");
      expect(io.length).toBeGreaterThan(0);
      expect(io.every((s) => s.fixed === false)).toBe(true);
    }
  });
});

// A form is a flow path whose ends belong to it. When the I/O are movable,
// applying a form must reflow them onto that form's entry/exit — otherwise the
// cell only reshapes its middle and the biggest shape gains are left on the table.
describe("applyForm reflows movable I/O with the form", () => {
  const model: Model = generateCandidates(BRIEF)[0].model;

  it("snaps a movable input/output to the form's entry/exit", () => {
    const movableProc = model.stations.filter((s) => s.role === "process" && !s.fixed);
    const topo = cellTopology("U", movableProc.length, model);
    const out = applyForm(model, "U");
    const input = out.find((s) => s.role === "input")!;
    const output = out.find((s) => s.role === "output")!;
    // U-cell: load and unload sit side by side at the open end.
    expect({ x: input.x, y: input.y }).toEqual({ x: topo.entry.x, y: topo.entry.y });
    expect({ x: output.x, y: output.y }).toEqual({ x: topo.exit.x, y: topo.exit.y });
    expect(input.x).toBe(output.x); // adjacent — the defining U property
  });

  it("leaves a PINNED area exactly where it is", () => {
    const pinned: Model = {
      ...model,
      stations: model.stations.map((s) => (s.role === "input" ? { ...s, fixed: true } : s)),
    };
    const before = pinned.stations.find((s) => s.role === "input")!;
    const after = applyForm(pinned, "U").find((s) => s.role === "input")!;
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
  });
});
