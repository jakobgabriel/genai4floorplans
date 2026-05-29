import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { buildRating } from "../engine/rating";
import { modelReducer, cloneStation, newStationId } from "./reducer";

describe("SET_WEIGHTS", () => {
  it("re-weights the composite (all weight on ergonomics → composite == ergo score)", () => {
    const next = modelReducer(SAMPLE, {
      type: "SET_WEIGHTS",
      weights: { flowCost: 0, travel: 0, congestion: 0, placement: 0, balance: 0, ergo: 1, auto: 0 },
    });
    const r = buildRating(next);
    expect(r.composite).toBeCloseTo(r.scores.ergo, 6);
  });

  it("clearing weights restores the default composite", () => {
    const weighted = modelReducer(SAMPLE, {
      type: "SET_WEIGHTS",
      weights: { flowCost: 1, travel: 0, congestion: 0, placement: 0, balance: 0, ergo: 0, auto: 0 },
    });
    const cleared = modelReducer(weighted, { type: "SET_WEIGHTS", weights: undefined });
    expect(buildRating(cleared).composite).toBeCloseTo(buildRating(SAMPLE).composite, 6);
  });
});

describe("cloneStation / newStationId", () => {
  it("produces a unique id and an offset, renamed copy", () => {
    const src = SAMPLE.stations.find((s) => s.id === "cnc")!;
    const clone = cloneStation(SAMPLE, src);
    expect(clone.id).not.toBe(src.id);
    expect(SAMPLE.stations.some((s) => s.id === clone.id)).toBe(false);
    expect(clone.name).toContain("copy");
    expect(clone.x !== src.x || clone.y !== src.y).toBe(true);
  });

  it("newStationId never collides with existing ids", () => {
    for (let i = 0; i < 50; i++) {
      const id = newStationId(SAMPLE);
      expect(SAMPLE.stations.some((s) => s.id === id)).toBe(false);
    }
  });
});

describe("RENAME_STATION rewrites flows", () => {
  it("updates flow endpoints", () => {
    const next = modelReducer(SAMPLE, { type: "RENAME_STATION", oldId: "cnc", newId: "lathe" });
    expect(next.stations.some((s) => s.id === "lathe")).toBe(true);
    expect(next.flows.some((f) => f.from === "lathe" || f.to === "lathe")).toBe(true);
    expect(next.flows.some((f) => f.from === "cnc" || f.to === "cnc")).toBe(false);
  });
});
