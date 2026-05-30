import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { dagLayout } from "./dag";

describe("dagLayout", () => {
  it("layers the SAMPLE line from input to output without a cycle", () => {
    const dag = dagLayout(SAMPLE.stations, SAMPLE.flows);
    expect(dag.hasCycle).toBe(false);
    const layer = Object.fromEntries(dag.nodes.map((n) => [n.id, n.layer]));
    expect(layer.raw).toBe(0);
    // each step sits strictly to the right of its predecessor
    expect(layer.cnc).toBeGreaterThan(layer.raw);
    expect(layer.press).toBeGreaterThan(layer.cnc);
    expect(layer.ship).toBe(Math.max(...dag.nodes.map((n) => n.layer)));
    expect(dag.edges.every((e) => !e.back)).toBe(true);
  });

  it("flags a back-edge as a cycle", () => {
    const flows = SAMPLE.flows.concat([{ from: "ship", to: "cnc", volume: 10, unitCost: 0, transport: "manual", partWeightKg: 0, notes: "" }]);
    const dag = dagLayout(SAMPLE.stations, flows);
    expect(dag.hasCycle).toBe(true);
    expect(dag.edges.some((e) => e.back)).toBe(true);
  });

  it("carries scrapRate onto nodes", () => {
    const stations = SAMPLE.stations.map((s) => (s.id === "cnc" ? { ...s, scrapRate: 0.1 } : s));
    const dag = dagLayout(stations, SAMPLE.flows);
    expect(dag.nodes.find((n) => n.id === "cnc")!.scrapRate).toBeCloseTo(0.1, 6);
  });
});
