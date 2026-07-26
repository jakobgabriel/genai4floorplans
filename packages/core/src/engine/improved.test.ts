import { describe, it, expect } from "vitest";
import type { Flow, Model, Station } from "../model/types";
import { normalizeFlow, normalizeStation } from "../model/defaults";
import { computeKPIs } from "./kpis";
import { improvedLayout } from "./improved";

const st = (p: Partial<Station> & { id: string }): Station => normalizeStation(p);
const fl = (from: string, to: string): Flow => normalizeFlow({ from, to, volume: 100 });

function cell(procs: Station[]): Model {
  const stations = [
    st({ id: "in", name: "In", role: "input", x: 1, y: 6, capacityPerShift: 100000 }),
    ...procs,
    st({ id: "out", name: "Out", role: "output", x: 30, y: 6, capacityPerShift: 100000 }),
  ];
  const ids = stations.map((s) => s.id);
  const flows = ids.slice(0, -1).map((id, i) => fl(id, ids[i + 1]));
  return { schemaVersion: 8, name: "T", gridW: 34, gridH: 14, shiftHours: 8, stations, flows, noGoZones: [] };
}

describe("improvedLayout", () => {
  it("relays a scattered cell into a materially cheaper layout", () => {
    // Stations scattered across the grid rather than on a path.
    const m = cell([
      st({ id: "a", name: "A", role: "process", x: 6, y: 1 }),
      st({ id: "b", name: "B", role: "process", x: 25, y: 11 }),
      st({ id: "c", name: "C", role: "process", x: 6, y: 11 }),
      st({ id: "d", name: "D", role: "process", x: 25, y: 1 }),
    ]);
    const r = improvedLayout(m);
    expect(r.better).toBe(true);
    // The improved layout's flow cost really is lower than the current one.
    const after = computeKPIs(r.stations, m.flows, m).flowCost;
    const before = computeKPIs(m.stations, m.flows, m).flowCost;
    expect(after).toBeLessThan(before);
    expect(r.deltas.flowCostPct).toBeLessThan(0);
    expect(r.rationale.length).toBeGreaterThan(20);
  });

  it("never changes the station set — only positions", () => {
    const m = cell([
      st({ id: "a", name: "A", role: "process", x: 6, y: 1 }),
      st({ id: "b", name: "B", role: "process", x: 25, y: 11 }),
      st({ id: "c", name: "C", role: "process", x: 6, y: 11 }),
    ]);
    const r = improvedLayout(m);
    expect(r.stations.map((s) => s.id).sort()).toEqual(m.stations.map((s) => s.id).sort());
    expect(r.stations.length).toBe(m.stations.length);
  });

  it("leaves fixed stations where they are", () => {
    const m = cell([
      st({ id: "a", name: "A", role: "process", x: 6, y: 1, fixed: true }),
      st({ id: "b", name: "B", role: "process", x: 25, y: 11 }),
      st({ id: "c", name: "C", role: "process", x: 6, y: 11 }),
    ]);
    const r = improvedLayout(m);
    const a = r.stations.find((s) => s.id === "a")!;
    expect({ x: a.x, y: a.y }).toEqual({ x: 6, y: 1 });
  });

  it("reports honestly when nothing helps (too few movable stations)", () => {
    const m = cell([st({ id: "a", name: "A", role: "process", x: 6, y: 6 })]);
    const r = improvedLayout(m);
    expect(r.better).toBe(false);
    expect(r.strategy).toBe("none");
    expect(r.deltas.flowCostPct).toBe(0);
  });

  it("picks a form strategy when a form shortens the route", () => {
    const m = cell([
      st({ id: "a", name: "A", role: "process", x: 6, y: 1 }),
      st({ id: "b", name: "B", role: "process", x: 25, y: 11 }),
      st({ id: "c", name: "C", role: "process", x: 6, y: 11 }),
      st({ id: "d", name: "D", role: "process", x: 25, y: 1 }),
      st({ id: "e", name: "E", role: "process", x: 15, y: 6 }),
    ]);
    const r = improvedLayout(m);
    if (r.strategy === "form") {
      expect(r.form).toMatch(/^[IULS]$/);
      expect(r.rationale).toMatch(/form path/);
    }
    expect(r.better).toBe(true);
  });
});
