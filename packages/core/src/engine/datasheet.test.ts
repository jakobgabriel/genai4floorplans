import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { archetypeCode } from "./archetype";
import { volumeSensitivity } from "./sensitivity";
import { cellDataSheet } from "./datasheet";

describe("archetype code (blueprint §02)", () => {
  it("produces a MA-shape-NN-seq-labour code for the sample", () => {
    const a = archetypeCode(SAMPLE);
    expect(a.code).toMatch(/^MA-[IULSNE]-\d{2}-[FV]-[HN]$/);
    expect(a.stations).toBe(4); // 4 process stations in the sample
    expect(a.code).toContain("-04-");
  });

  it("a single process step is the E (single-station) archetype", () => {
    const one = { ...SAMPLE, stations: SAMPLE.stations.filter((s) => s.id === "cnc" || s.role !== "process") };
    expect(archetypeCode(one).flowShape).toBe("E");
  });
});

describe("volume sensitivity (blueprint §11)", () => {
  it("drops the takt by the volume increase and renders a sentence", () => {
    const s = volumeSensitivity(SAMPLE, 0.2);
    expect(s.newTakt).toBeCloseTo(s.currentTakt / 1.2, 1);
    expect(typeof s.sentence).toBe("string");
    expect(s.sentence.length).toBeGreaterThan(10);
  });
});

describe("cell data sheet (blueprint §11)", () => {
  it("aggregates the identical-form fields from the model", () => {
    const d = cellDataSheet(SAMPLE);
    expect(d.archetype).toMatch(/^MA-/);
    expect(d.productFamily).toBe(SAMPLE.name);
    expect(d.stationsChosen).toBe(4);
    expect(d.operators).toBe(SAMPLE.stations.reduce((a, s) => a + s.operators, 0));
    expect(d.floorSpaceCell).toBeGreaterThan(0);
    expect(d.floorSpaceMaterialSupply).toBeGreaterThan(0);
    expect(d.behaviourAtPlus20).toContain("takt");
    // The estimated assembly cycle surfaces as an open point.
    expect(d.openPoints.some((p) => /Assembly/.test(p))).toBe(true);
  });
});
