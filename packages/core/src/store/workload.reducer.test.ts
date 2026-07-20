import { describe, it, expect } from "vitest";
import type { Model, VariantMode } from "../model/types";
import { makeWorkElement, analyseWorkload, precedenceOrder } from "../engine/workload";
import { modelReducer } from "./reducer";

// Spec §11 — the workload editor's reducer half.
//
// `analyseWorkload` shipped in schema v8 and nothing could feed it: the model
// carried `workElements` but no action wrote them. These tests pin the write
// path, and in particular that deleting an element deletes every reference to
// it — a dangling predecessor reads as a precedence CYCLE downstream, which
// presents as "the balancer is broken" rather than "the model is stale".

function base(): Model {
  return {
    name: "t", gridW: 20, gridH: 12, stations: [], flows: [], noGoZones: [],
    workElements: [
      makeWorkElement("a", "Load", 10),
      { ...makeWorkElement("b", "Weld", 20), predecessors: ["a"] },
      { ...makeWorkElement("c", "Inspect", 5), predecessors: ["b"], mustBeSameStationAs: ["a"], mustNotBeSameStationAs: ["b"] },
    ],
  };
}

describe("work element actions", () => {
  it("adds and updates", () => {
    const added = modelReducer(base(), { type: "ADD_WORK_ELEMENT", element: makeWorkElement("d", "Mark", 3) });
    expect(added.workElements).toHaveLength(4);

    const upd = modelReducer(added, { type: "UPDATE_WORK_ELEMENT", id: "d", patch: { classification: "NVA" } });
    expect(upd.workElements!.find((e) => e.id === "d")!.classification).toBe("NVA");
    // Untouched fields survive a partial patch.
    expect(upd.workElements!.find((e) => e.id === "d")!.time.seconds).toBe(3);
  });

  it("SET_WORK_ELEMENTS replaces the set in one commit (derive-from-stations)", () => {
    const seeded = modelReducer(base(), { type: "SET_WORK_ELEMENTS", elements: [makeWorkElement("x", "Only", 7)] });
    expect(seeded.workElements!.map((e) => e.id)).toEqual(["x"]);
  });

  it("adds onto a model that has no workElements at all", () => {
    const empty: Model = { name: "t", gridW: 10, gridH: 10, stations: [], flows: [], noGoZones: [] };
    const out = modelReducer(empty, { type: "ADD_WORK_ELEMENT", element: makeWorkElement("a", "A", 1) });
    expect(out.workElements).toHaveLength(1);
  });

  it("deleting an element strips it from predecessors and zoning", () => {
    const out = modelReducer(base(), { type: "DELETE_WORK_ELEMENT", id: "a" });

    expect(out.workElements!.map((e) => e.id)).toEqual(["b", "c"]);
    expect(out.workElements!.find((e) => e.id === "b")!.predecessors).toEqual([]);
    expect(out.workElements!.find((e) => e.id === "c")!.mustBeSameStationAs).toEqual([]);
    // And the DAG is still walkable — the actual point of the cleanup.
    expect(precedenceOrder(out.workElements!)).not.toBeNull();
  });

  it("deleting an element strips it from every mode's overrides", () => {
    const modes: VariantMode[] = [
      { id: "m1", name: "Base", share: 0.5, elementOverrides: { a: 1.5, b: 1 } },
      { id: "m2", name: "Heavy", share: 0.5, elementOverrides: { b: 2 } },
    ];
    const out = modelReducer({ ...base(), variantModes: modes }, { type: "DELETE_WORK_ELEMENT", id: "a" });

    expect(out.variantModes![0].elementOverrides).toEqual({ b: 1 });
    expect(out.variantModes![1].elementOverrides).toEqual({ b: 2 });
  });
});

describe("variant mode actions", () => {
  const mode: VariantMode = { id: "m1", name: "Heavy", share: 0.4, elementOverrides: { b: 2 } };

  it("adds, updates and deletes", () => {
    const added = modelReducer(base(), { type: "ADD_VARIANT_MODE", mode });
    expect(added.variantModes).toHaveLength(1);

    const upd = modelReducer(added, { type: "UPDATE_VARIANT_MODE", id: "m1", patch: { share: 0.6 } });
    expect(upd.variantModes![0].share).toBe(0.6);
    expect(upd.variantModes![0].elementOverrides).toEqual({ b: 2 });

    expect(modelReducer(upd, { type: "DELETE_VARIANT_MODE", id: "m1" }).variantModes).toHaveLength(0);
  });
});

describe("the editor reaches the engine", () => {
  it("an edit made through the reducer changes the analysis", () => {
    const before = analyseWorkload(base().workElements!, undefined);
    const heavier = modelReducer(base(), { type: "UPDATE_WORK_ELEMENT", id: "b", patch: { time: { seconds: 40, method: "estimate", confidence: "low" } } });
    const after = analyseWorkload(heavier.workElements!, undefined);

    expect(after.weightedTotalSec).toBe(before.weightedTotalSec + 20);
  });

  it("flags an element that cannot fit one station at takt", () => {
    const a = analyseWorkload(base().workElements!, undefined, 15);
    expect(a.overTaktElements.map((e) => e.elementId)).toContain("b"); // 20s > 15s takt
  });
});
