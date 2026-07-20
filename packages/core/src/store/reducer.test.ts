import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { buildRating } from "../engine/rating";
import { modelReducer, cloneStation, newStationId } from "./reducer";
import { normalizeFlow } from "../model/defaults";

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

describe("INSERT_SUBFLOW", () => {
  const members = SAMPLE.stations.filter((s) => s.role === "process").slice(0, 2);
  const sub = {
    // normalise to the group's own corner
    stations: members.map((s, i) => ({ ...s, x: i * 4, y: 0 })),
    flows: [normalizeFlow({ from: members[0].id, to: members[1].id, volume: 100 })],
  };

  it("appends re-id'd members and their internal flow, touching nothing else", () => {
    const before = SAMPLE.stations.length;
    const next = modelReducer(SAMPLE, { type: "INSERT_SUBFLOW", stations: sub.stations, flows: sub.flows, x: 2, y: 2 });
    expect(next.stations.length).toBe(before + 2);
    // Fresh ids — never the member ids.
    const added = next.stations.slice(before);
    expect(added.every((s) => !members.some((m) => m.id === s.id))).toBe(true);
    // Offset applied to the drop point.
    expect(added[0].x).toBe(2);
    expect(added[0].y).toBe(2);
    // The internal flow was remapped onto the new ids.
    const link = next.flows.find((f) => f.from === added[0].id && f.to === added[1].id);
    expect(link).toBeTruthy();
  });

  it("does not collide ids when inserted twice", () => {
    let m = modelReducer(SAMPLE, { type: "INSERT_SUBFLOW", stations: sub.stations, flows: sub.flows, x: 2, y: 2 });
    m = modelReducer(m, { type: "INSERT_SUBFLOW", stations: sub.stations, flows: sub.flows, x: 6, y: 6 });
    const ids = m.stations.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
