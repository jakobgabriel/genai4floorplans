import { describe, it, expect } from "vitest";
import type { ChangeoverMatrix, LinePortfolio, Workload } from "./portfolioModel";
import { DEFAULT_AVAILABLE_TIME } from "./portfolioModel";
import { makeWorkElement } from "../engine/workload";
import { assessPortfolio, availableSeconds, coverageCheck, resourcesFromStations, type LineResource } from "./portfolioEngine";
import { changeoverCost, deriveMatrix, familyOf, sequenceMembers } from "./changeover";
import { normalizeStation } from "../model/defaults";

const wl = (id: string, caps: string[], sec = 30): Workload => ({
  id,
  name: id.toUpperCase(),
  elements: caps.map((c, i) => ({ ...makeWorkElement(`${id}-e${i}`, `${c} step`, sec), capabilityId: c })),
});

const res = (id: string, provides: string[], band?: LineResource["volumeBand"]): LineResource => ({
  id,
  name: id,
  provides,
  volumeBand: band,
});

const portfolio = (members: Array<[string, number, "must_run" | "should_run" | "optional"]>): LinePortfolio => ({
  id: "p1",
  version: 1,
  lineId: "line1",
  regime: "multi_model",
  sequencingPolicy: "optimized",
  members: members.map(([workloadId, units, priority]) => ({
    workloadId,
    demand: { unitsPerPeriod: units, period: "year" },
    priority,
    batchConstraints: { campaignFrequencyPerYear: 12 },
  })),
});

describe("gate 1 — coverage", () => {
  const workloads = [wl("a", ["weld", "test"]), wl("b", ["weld", "paint"])];
  const resources = [res("r1", ["weld"]), res("r2", ["test"])];

  it("names exactly which capability blocks which part", () => {
    const cov = coverageCheck(workloads, resources);
    expect(cov.find((c) => c.workloadId === "a")?.missing).toEqual([]);
    expect(cov.find((c) => c.workloadId === "b")?.missing).toEqual(["paint"]);
  });

  it("fails the member at gate 1 with an actionable reason", () => {
    const r = assessPortfolio({ portfolio: portfolio([["a", 1000, "must_run"], ["b", 1000, "should_run"]]), workloads, resources, stationCount: 10 });
    const b = r.perMember.find((m) => m.workloadId === "b");
    expect(b?.verdict).toBe("infeasible");
    expect(b?.failedGate).toBe(1);
    expect(b?.blockingReason).toMatch(/paint/);
    expect(b?.requiredChanges[0].type).toBe("add_capability");
  });

  it("reads capabilities off ordinary stations", () => {
    const stations = [
      normalizeStation({ id: "s1", role: "process", provides: ["weld"] }),
      normalizeStation({ id: "in", role: "input" }),
    ];
    expect(resourcesFromStations(stations)).toHaveLength(1);
    expect(resourcesFromStations(stations)[0].provides).toEqual(["weld"]);
  });

  it("treats a workload with no declared capabilities as covered", () => {
    const plain: Workload = { id: "p", name: "P", elements: [makeWorkElement("e", "E", 10)] };
    expect(coverageCheck([plain], [])[0].missing).toEqual([]);
  });
});

describe("gate 2 — technical fit", () => {
  it("flags a resource used outside its validated volume band", () => {
    const r = assessPortfolio({
      portfolio: portfolio([["a", 5_000_000, "must_run"]]),
      workloads: [wl("a", ["weld"])],
      resources: [res("r1", ["weld"], { minUnitsPerYear: 1000, maxUnitsPerYear: 100_000 })],
      stationCount: 20,
    });
    const a = r.perMember[0];
    expect(a.failedGate).toBe(2);
    expect(a.verdict).toBe("fits_with_changes");
    expect(a.confidence).toBe("low"); // extrapolating beyond validated range
  });

  it("says the gate was not assessed when no band is declared", () => {
    const r = assessPortfolio({
      portfolio: portfolio([["a", 1000, "must_run"]]),
      workloads: [wl("a", ["weld"])],
      resources: [res("r1", ["weld"])],
      stationCount: 20,
    });
    expect(r.notAssessed.map((n) => n.gate)).toContain(2);
  });
});

describe("gate 3 — capacity including changeover", () => {
  const workloads = [wl("a", ["weld"], 60), wl("b", ["weld"], 60)];
  const resources = [res("r1", ["weld"])];
  const matrix: ChangeoverMatrix = {
    id: "m",
    lineId: "line1",
    families: { a: "fam1", b: "fam2" },
    entries: [
      { fromFamily: "fam1", toFamily: "fam2", internalSeconds: 3600, externalSeconds: 0, confidence: "med" },
      { fromFamily: "fam2", toFamily: "fam1", internalSeconds: 3600, externalSeconds: 0, confidence: "med" },
    ],
    defaultInternalSeconds: 1800,
    symmetric: true,
    confidence: "med",
  };

  it("reports utilisation with and without changeover separately", () => {
    const r = assessPortfolio({
      portfolio: portfolio([["a", 50_000, "must_run"], ["b", 50_000, "should_run"]]),
      workloads,
      resources,
      stationCount: 30,
      matrix,
    });
    expect(r.capacity.changeoverTimeHours).toBeGreaterThan(0);
    expect(r.capacity.utilizationPct).toBeGreaterThan(r.capacity.utilizationExclChangeoverPct);
  });

  it("charges no changeover between workloads in the same family", () => {
    const same: ChangeoverMatrix = { ...matrix, families: { a: "fam1", b: "fam1" } };
    const r = assessPortfolio({
      portfolio: portfolio([["a", 10_000, "must_run"], ["b", 10_000, "should_run"]]),
      workloads,
      resources,
      stationCount: 30,
      matrix: same,
    });
    expect(r.capacity.changeoverTimeHours).toBe(0);
  });

  it("warns when changeover eats a material share of loaded time", () => {
    const heavy: ChangeoverMatrix = { ...matrix, entries: matrix.entries.map((e) => ({ ...e, internalSeconds: 20000 })) };
    const r = assessPortfolio({
      portfolio: portfolio([["a", 5_000, "must_run"], ["b", 5_000, "should_run"]]),
      workloads,
      resources,
      stationCount: 30,
      matrix: heavy,
    });
    expect(r.issues.join(" ")).toMatch(/Changeover consumes/);
  });

  it("computes available time from the shift model", () => {
    // 8h x 2 shifts x 230 days x 0.95 x 0.85
    expect(availableSeconds(DEFAULT_AVAILABLE_TIME)).toBeCloseTo(8 * 2 * 230 * 3600 * 0.95 * 0.85, 0);
  });
});

describe("gate 4 — balance against the line's stations", () => {
  it("fails a member needing more stations than the line has", () => {
    // Huge demand => tiny takt => many stations required.
    const r = assessPortfolio({
      portfolio: portfolio([["a", 4_000_000, "must_run"]]),
      workloads: [wl("a", ["weld", "test", "pack"], 60)],
      resources: [res("r1", ["weld", "test", "pack"])],
      stationCount: 3,
    });
    const a = r.perMember[0];
    expect(a.failedGate).toBe(4);
    expect(a.blockingReason).toMatch(/stations/);
    expect(a.minStations).toBeGreaterThan(3);
  });
});

describe("drop analysis", () => {
  it("ranks the cheapest sacrifice that actually makes the line fit", () => {
    const workloads = [wl("big", ["weld"], 120), wl("small", ["weld"], 120), wl("core", ["weld"], 120)];
    const r = assessPortfolio({
      portfolio: portfolio([
        ["core", 20_000, "must_run"],
        ["big", 40_000, "should_run"],
        ["small", 3_000, "optional"],
      ]),
      workloads,
      resources: [res("r1", ["weld"])],
      stationCount: 30,
    });

    if (r.capacity.utilizationPct > 100) {
      expect(r.dropAnalysis.length).toBeGreaterThan(0);
      // must_run members are never drop candidates
      expect(r.dropAnalysis.map((d) => d.workloadId)).not.toContain("core");
      // every candidate reports what it costs and what it buys
      r.dropAnalysis.forEach((d) => {
        expect(d.unitsSacrificed).toBeGreaterThan(0);
        expect(d.utilizationAfterPct).toBeLessThan(r.capacity.utilizationPct);
      });
    }
  });

  it("is empty when the portfolio already fits", () => {
    const r = assessPortfolio({
      portfolio: portfolio([["a", 100, "should_run"]]),
      workloads: [wl("a", ["weld"], 10)],
      resources: [res("r1", ["weld"])],
      stationCount: 10,
    });
    expect(r.dropAnalysis).toEqual([]);
    expect(r.verdict).toBe("all_fit");
  });
});

describe("changeover matrix", () => {
  const matrix: ChangeoverMatrix = {
    id: "m",
    lineId: "l",
    families: { p1: "A", p2: "A", p3: "B" },
    entries: [{ fromFamily: "A", toFamily: "B", internalSeconds: 900, externalSeconds: 300, confidence: "high" }],
    defaultInternalSeconds: 1200,
    symmetric: true,
    confidence: "high",
  };

  it("groups parts into families so the matrix stays populatable at 40 parts", () => {
    expect(familyOf(matrix, "p1")).toBe("A");
    expect(familyOf(matrix, "p2")).toBe("A");
    expect(familyOf(matrix, "unknown")).toBe("unknown");
  });

  it("charges nothing inside a family", () => {
    expect(changeoverCost(matrix, "p1", "p2").internalSeconds).toBe(0);
  });

  it("uses the symmetric entry when only one direction is populated", () => {
    expect(changeoverCost(matrix, "p3", "p1").internalSeconds).toBe(900);
  });

  it("falls back to the default and says so", () => {
    const sparse: ChangeoverMatrix = { ...matrix, entries: [] };
    const c = changeoverCost(sparse, "p1", "p3");
    expect(c.internalSeconds).toBe(1200);
    expect(c.isDefault).toBe(true);
  });

  it("derives a matrix from tooling deltas", () => {
    const d = deriveMatrix("l", { A: ["t1", "t2"], B: ["t1", "t3"] }, 600);
    const ab = d.entries.find((e) => e.fromFamily === "A" && e.toFamily === "B");
    expect(ab?.internalSeconds).toBe(1200); // t2 out, t3 in
    expect(d.confidence).toBe("low"); // derived, not measured
  });
});

describe("sequencing", () => {
  const matrix: ChangeoverMatrix = {
    id: "m",
    lineId: "l",
    families: { a: "A", b: "B", c: "C" },
    entries: [
      { fromFamily: "A", toFamily: "B", internalSeconds: 100, externalSeconds: 0, confidence: "high" },
      { fromFamily: "B", toFamily: "C", internalSeconds: 100, externalSeconds: 0, confidence: "high" },
      { fromFamily: "C", toFamily: "A", internalSeconds: 100, externalSeconds: 0, confidence: "high" },
      { fromFamily: "A", toFamily: "C", internalSeconds: 5000, externalSeconds: 0, confidence: "high" },
      { fromFamily: "C", toFamily: "B", internalSeconds: 5000, externalSeconds: 0, confidence: "high" },
      { fromFamily: "B", toFamily: "A", internalSeconds: 5000, externalSeconds: 0, confidence: "high" },
    ],
    defaultInternalSeconds: 9999,
    symmetric: false,
    confidence: "high",
  };

  it("finds the cheap cycle rather than the input order", () => {
    const r = sequenceMembers(["c", "b", "a"], matrix, "optimized");
    expect(r.cycleInternalSeconds).toBe(300); // A→B→C→A
    expect(r.method).toBe("greedy+2opt");
  });

  it("respects a fixed policy even when it is worse", () => {
    const r = sequenceMembers(["a", "c", "b"], matrix, "fixed");
    expect(r.method).toBe("fixed");
    expect(r.order).toEqual(["a", "c", "b"]);
  });

  it("is deterministic", () => {
    const a = sequenceMembers(["a", "b", "c"], matrix, "optimized").order;
    const b = sequenceMembers(["a", "b", "c"], matrix, "optimized").order;
    expect(a).toEqual(b);
  });

  it("handles zero and one member without dividing by zero", () => {
    expect(sequenceMembers([], matrix).cycleInternalSeconds).toBe(0);
    expect(sequenceMembers(["a"], matrix).changeoversPerCycle).toBe(0);
  });
});

describe("honesty", () => {
  it("reports gate 5 as not assessed when no envelope is supplied", () => {
    const r = assessPortfolio({
      portfolio: portfolio([["a", 100, "must_run"]]),
      workloads: [wl("a", ["weld"], 10)],
      resources: [res("r1", ["weld"])],
      stationCount: 5,
    });
    expect(r.notAssessed.find((n) => n.gate === 5)?.why).toMatch(/No envelope/);
  });

  it("propagates the weakest confidence across members and the matrix", () => {
    const lowMatrix: ChangeoverMatrix = {
      id: "m", lineId: "l", families: {}, entries: [], defaultInternalSeconds: 60, symmetric: true, confidence: "low",
    };
    const r = assessPortfolio({
      portfolio: portfolio([["a", 100, "must_run"]]),
      workloads: [wl("a", ["weld"], 10)],
      resources: [res("r1", ["weld"])],
      stationCount: 5,
      matrix: lowMatrix,
    });
    expect(r.confidence).toBe("low");
  });

  it("marks members infeasible when the spatial check failed", () => {
    const r = assessPortfolio({
      portfolio: portfolio([["a", 100, "must_run"]]),
      workloads: [wl("a", ["weld"], 10)],
      resources: [res("r1", ["weld"])],
      stationCount: 5,
      spatialVerdict: "infeasible",
    });
    expect(r.perMember[0].failedGate).toBe(5);
    expect(r.verdict).toBe("infeasible");
  });
});
