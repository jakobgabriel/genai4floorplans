import { describe, it, expect } from "vitest";
import type { Model, Station, WorkElement } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { makeWorkElement } from "./workload";
import { capabilityCoverage } from "./coverage";
import { DEFAULT_CAPABILITIES } from "../model/capabilities";

const we = (id: string, cap?: string): WorkElement => ({ ...makeWorkElement(id, id, 10), capabilityId: cap });
const prov = (id: string, provides: string[]): Station => ({
  id, name: id, role: "process", type: "machine", x: 0, y: 0, w: 2, h: 2, fixed: false,
  auto: "manual", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec: 10,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", provides,
});
const model = (workElements: WorkElement[], stations: Station[]): Model => ({
  schemaVersion: SCHEMA_VERSION, name: "m", gridW: 20, gridH: 12, shiftHours: 8,
  stations, flows: [], noGoZones: [], workElements,
});

describe("capability coverage — Gate 1 (audit C-01)", () => {
  it("is empty when the workload declares no capabilities", () => {
    const r = capabilityCoverage(model([we("a")], []));
    expect(r.empty).toBe(true);
    expect(r.gate1Pass).toBe(false);
  });

  it("passes when every required capability is directly provided", () => {
    const r = capabilityCoverage(model([we("a", "cut.machining"), we("b", "join.weld")], [prov("s1", ["cut.machining", "join.weld"])]));
    expect(r.missing).toBe(0);
    expect(r.covered).toBe(2);
    expect(r.gate1Pass).toBe(true);
  });

  it("covers a demand through an alternative (weld ⇄ bolt) and names the substitute", () => {
    // Required weld, but the line only provides mechanical assembly — a valid §7 substitution.
    const r = capabilityCoverage(model([we("a", "join.weld")], [prov("s1", ["join.assemble"])]));
    const st = r.required[0];
    expect(st.status).toBe("alternative");
    expect(st.via).toBe("join.assemble");
    expect(r.gate1Pass).toBe(true); // alternatives still clear Gate 1
    expect(r.missing).toBe(0);
  });

  it("flags a genuinely uncovered capability as the blocker", () => {
    const r = capabilityCoverage(model([we("a", "cut.machining"), we("b", "mark.identify")], [prov("s1", ["cut.machining"])]));
    expect(r.missing).toBe(1);
    expect(r.required.find((s) => s.id === "mark.identify")?.status).toBe("missing");
    expect(r.gate1Pass).toBe(false);
  });

  it("uses the seeded catalog by default so it works offline", () => {
    expect(DEFAULT_CAPABILITIES.some((c) => c.id === "join.weld" && c.alternatives?.includes("join.assemble"))).toBe(true);
  });
});
