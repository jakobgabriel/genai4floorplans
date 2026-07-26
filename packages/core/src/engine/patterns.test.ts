import { describe, it, expect } from "vitest";
import type { Model, Station, Flow } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { minePatterns } from "./patterns";

const st = (id: string, type: Station["type"]): Station => ({
  id, name: id, role: "process", type, x: 0, y: 0, w: 2, h: 2, fixed: false,
  auto: "manual", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec: 30,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", provides: [],
});
const fl = (from: string, to: string): Flow => ({ from, to, volume: 100, unitCost: 1, transport: "manual", partWeightKg: 1, notes: "" });
const model = (stations: Station[], flows: Flow[]): Model => ({
  schemaVersion: SCHEMA_VERSION, name: "m", gridW: 40, gridH: 20, shiftHours: 8, stations, flows, noGoZones: [],
});

// A machine→quality chain used in two different layouts.
const layoutA = model(
  [st("a1", "machine"), st("a2", "quality"), st("a3", "buffer")],
  [fl("a1", "a2"), fl("a2", "a3")],
);
const layoutB = model(
  [st("b1", "machine"), st("b2", "quality"), st("b3", "store")],
  [fl("b1", "b2"), fl("b2", "b3")],
);

describe("pattern mining (audit C-12, §30–35)", () => {
  it("finds a motif that recurs across two layouts", () => {
    const cands = minePatterns([
      { key: "A", name: "Layout A", model: layoutA },
      { key: "B", name: "Layout B", model: layoutB },
    ]);
    const mq = cands.find((c) => c.signature === "machine>quality");
    expect(mq).toBeDefined();
    expect(mq!.sources).toBe(2); // appears in both layouts
    expect(mq!.occurrences).toBe(2);
    expect(mq!.label).toBe("Machine → Quality");
  });

  it("does not report a one-off motif (below minOccurrences)", () => {
    const cands = minePatterns([{ key: "A", model: layoutA }]);
    // machine>quality>buffer occurs once → dropped; nothing recurs in a single
    // linear 3-chain, so no candidates survive the default minOccurrences=2.
    expect(cands.every((c) => c.occurrences >= 2)).toBe(true);
    expect(cands.find((c) => c.signature === "machine>quality>buffer")).toBeUndefined();
  });

  it("counts a repeated motif within one layout", () => {
    // machine→machine appears at 3 consecutive links → 3 occurrences.
    const chain = model(
      [st("s1", "machine"), st("s2", "machine"), st("s3", "machine"), st("s4", "machine")],
      [fl("s1", "s2"), fl("s2", "s3"), fl("s3", "s4")],
    );
    const cands = minePatterns([{ key: "C", model: chain }], { maxLen: 2 });
    const mm = cands.find((c) => c.signature === "machine>machine");
    expect(mm).toBeDefined();
    expect(mm!.occurrences).toBe(3);
    expect(mm!.sources).toBe(1);
  });

  it("keeps concrete station ids on each instance for extraction", () => {
    const cands = minePatterns([{ key: "A", model: layoutA }, { key: "B", model: layoutB }]);
    const mq = cands.find((c) => c.signature === "machine>quality")!;
    const a = mq.instances.find((i) => i.key === "A")!;
    expect(a.stationIds).toEqual(["a1", "a2"]);
    expect(a.names).toEqual(["a1", "a2"]);
  });

  it("ranks broader-reuse motifs first", () => {
    const cands = minePatterns([{ key: "A", model: layoutA }, { key: "B", model: layoutB }]);
    // machine>quality (2 sources) outranks anything appearing in one source.
    expect(cands[0].sources).toBeGreaterThanOrEqual(cands[cands.length - 1].sources);
  });
});
