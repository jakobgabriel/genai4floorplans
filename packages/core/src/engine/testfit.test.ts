import { describe, it, expect } from "vitest";
import type { Model, Station, PartEntry, WorkElement, Flow } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { testfit } from "./testfit";

const prov = (id: string, provides: string[], over: Partial<Station> = {}): Station => ({
  id, name: id, role: "process", type: "machine", x: 0, y: 0, w: 2, h: 2, fixed: false,
  auto: "manual", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec: 10,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", provides, ...over,
});
const part = (number: string, caps: string[], over: Partial<PartEntry> = {}): PartEntry => ({
  id: number, number, requiredCapabilityIds: caps, ...over,
});
const el = (id: string, seconds: number, over: Partial<WorkElement> = {}): WorkElement => ({
  id, name: id, predecessors: [], time: { seconds, method: "estimate", confidence: "med" },
  classification: "VA", attendedFraction: 1, ergonomicLoad: "light", ...over,
});
// demand year units → takt = 6,336,000 / units (net available time, OEE excluded).
const model = (over: Partial<Model> = {}): Model => ({
  schemaVersion: SCHEMA_VERSION, name: "m", gridW: 20, gridH: 12, shiftHours: 8,
  stations: [], flows: [], noGoZones: [], ...over,
});

describe("testfit — feasibility service (audit C-04, spec §20)", () => {
  it("reports insufficient-data on a blank model", () => {
    const r = testfit(model());
    expect(r.verdict).toBe("insufficient-data");
    expect(r.bindingConstraint).toBeNull();
    expect(r.feasible).toBe(true); // nothing blocks
  });

  it("blocks on a missing capability (Gate 1) and names it as binding", () => {
    const r = testfit(model({
      stations: [prov("s1", ["cut.machining"])],
      parts: [part("P1", ["cut.machining", "form.press"], { demandPerYear: 1000 })],
    }));
    expect(r.verdict).toBe("infeasible");
    expect(r.feasible).toBe(false);
    expect(r.bindingConstraint?.gate).toBe("coverage");
    expect(r.gates.find((g) => g.id === "coverage")!.status).toBe("block");
  });

  it("passes coverage when every capability is provided", () => {
    const r = testfit(model({
      stations: [prov("s1", ["cut.machining", "form.press"])],
      parts: [part("P1", ["cut.machining", "form.press"], { demandPerYear: 1000 })],
    }));
    expect(r.gates.find((g) => g.id === "coverage")!.status).toBe("pass");
  });

  it("blocks on takt when the constraint step exceeds customer takt", () => {
    // 100,000 units → takt 63.36s; a 120s station cannot meet it.
    const r = testfit(model({
      stations: [prov("s1", ["cut.machining"], { cycleTimeSec: 120 })],
      demand: { years: [{ year: 2026, units: 100000 }] },
    }));
    const takt = r.gates.find((g) => g.id === "takt")!;
    expect(takt.status).toBe("block");
    expect(r.bindingConstraint?.gate).toBe("takt");
  });

  it("passes takt when the constraint clears customer takt", () => {
    const r = testfit(model({
      stations: [prov("s1", ["cut.machining"], { cycleTimeSec: 30 })],
      demand: { years: [{ year: 2026, units: 100000 }] },
    }));
    expect(r.gates.find((g) => g.id === "takt")!.status).toBe("pass");
  });

  it("warns (not blocks) when the constraint clears takt on the mean but its p95 tail does not", () => {
    // 100,000 units → takt 63.36s; a 55s mean clears it, but cv 0.25 pushes p95 over.
    const r = testfit(model({
      stations: [prov("s1", ["cut.machining"], { cycleTimeSec: 55, cycleCV: 0.25 })],
      demand: { years: [{ year: 2026, units: 100000 }] },
    }));
    const takt = r.gates.find((g) => g.id === "takt")!;
    expect(takt.status).toBe("warn");
    expect(r.feasible).toBe(true); // a warn does not block
    expect(r.violations.some((v) => v.gate === "takt" && v.sev === "warn")).toBe(true);
  });

  it("skips takt when no demand is modelled", () => {
    const r = testfit(model({ stations: [prov("s1", ["cut.machining"], { cycleTimeSec: 30 })] }));
    expect(r.gates.find((g) => g.id === "takt")!.status).toBe("skipped");
  });

  it("blocks on work-content balance when an element exceeds takt alone", () => {
    // 100,000 units → takt 63.36s; a 90s element cannot fit one station.
    const r = testfit(model({
      workElements: [el("e1", 90), el("e2", 20)],
      demand: { years: [{ year: 2026, units: 100000 }] },
    }));
    const bal = r.gates.find((g) => g.id === "balance")!;
    expect(bal.status).toBe("block");
    expect(bal.detail.some((d) => d.includes("e1"))).toBe(true);
  });

  it("blocks on capacity (Gate 3) when the portfolio overruns available time", () => {
    // default: 220×1×8×3600×0.85 = 5,385,600 s/yr available.
    const r = testfit(model({
      stations: [prov("s1", ["cut.machining"], { cycleTimeSec: 60 })],
      parts: [
        part("P1", ["cut.machining"], { demandPerYear: 60000 }),
        part("P2", ["cut.machining"], { demandPerYear: 60000 }),
      ],
    }));
    // 120,000 × 60 = 7,200,000 > 5,385,600
    const cap = r.gates.find((g) => g.id === "capacity")!;
    expect(cap.status).toBe("block");
    expect(cap.detail.join(" ")).toMatch(/Drop/);
  });

  it("blocks on layout realism when a station sits off the floor polygon", () => {
    const r = testfit(model({
      stations: [prov("s1", ["cut.machining"], { x: 18, y: 10, w: 4, h: 4 })],
      floorPolygon: [[0, 0], [10, 0], [10, 8], [0, 8]],
    }));
    const layout = r.gates.find((g) => g.id === "layout")!;
    expect(layout.status).toBe("block");
  });

  it("ranks coverage above every other blocker for the binding constraint", () => {
    // Simultaneously: missing capability AND an over-takt station AND over-capacity.
    const r = testfit(model({
      stations: [prov("s1", ["cut.machining"], { cycleTimeSec: 120 })],
      parts: [part("P1", ["cut.machining", "form.press"], { demandPerYear: 200000 })],
      demand: { years: [{ year: 2026, units: 200000 }] },
    }));
    expect(r.bindingConstraint?.gate).toBe("coverage");
    // but the takt/capacity blocks are still reported in violations
    expect(r.violations.filter((v) => v.sev === "block").length).toBeGreaterThan(1);
  });

  it("is feasible when a coherent single-part line clears every gate", () => {
    const stations: Station[] = [prov("s1", ["cut.machining"], { cycleTimeSec: 30, x: 2, y: 2 })];
    const flows: Flow[] = [];
    const r = testfit(model({
      stations, flows,
      parts: [part("P1", ["cut.machining"], { demandPerYear: 50000 })],
      demand: { years: [{ year: 2026, units: 50000 }] },
    }));
    expect(r.verdict).toBe("feasible");
    expect(r.feasible).toBe(true);
    expect(r.bindingConstraint).toBeNull();
  });
});
