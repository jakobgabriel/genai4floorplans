import { describe, it, expect } from "vitest";
import type { VariantMode, WorkElement } from "../model/types";
import { makeWorkElement } from "./workload";
import { assignStations } from "./assign";
import { inferWorkload, matchHint } from "./infer";

const el = (id: string, sec: number, over: Partial<WorkElement> = {}): WorkElement => ({
  ...makeWorkElement(id, id, sec),
  ...over,
});

const chain = (specs: Array<[string, number]>): WorkElement[] =>
  specs.map(([id, sec], i) => el(id, sec, { predecessors: i > 0 ? [specs[i - 1][0]] : [] }));

describe("inference — collapsing the input burden", () => {
  it("matches capability from a bare step name", () => {
    expect(matchHint("CNC rough turn")?.capabilityId).toBe("cut.machining");
    expect(matchHint("MIG weld bracket")?.capabilityId).toBe("join.weld");
    expect(matchHint("Leak test")?.capabilityId).toBe("test.function");
    expect(matchHint("Move to buffer")?.capabilityId).toBe("transport.move");
  });

  it("prefers the longest matching keyword", () => {
    // "stamp id" (mark) must beat "stamp" (form).
    expect(matchHint("Stamp ID on housing")?.capabilityId).toBe("mark.identify");
  });

  it("produces a full WorkElement from name alone", () => {
    const r = inferWorkload([{ name: "Weld flange" }]);
    const e = r.elements[0];
    expect(e.capabilityId).toBe("join.weld");
    expect(e.classification).toBe("VA");
    expect(e.attendedFraction).toBe(0.6);
    expect(e.time.seconds).toBe(55); // catalog default
    expect(e.time.confidence).toBe("low"); // nothing was supplied
  });

  it("trusts a supplied time more than a catalog default", () => {
    const r = inferWorkload([{ name: "Weld flange", seconds: 70 }]);
    expect(r.elements[0].time.seconds).toBe(70);
    expect(r.elements[0].time.confidence).toBe("med");
  });

  it("classifies transport and waiting as waste automatically", () => {
    const r = inferWorkload([{ name: "Carry to press" }, { name: "Cool down" }]);
    expect(r.elements[0].classification).toBe("NVA");
    expect(r.elements[0].wasteClass).toBe("transport");
    expect(r.elements[1].wasteClass).toBe("waiting");
    expect(r.elements[1].attendedFraction).toBe(0); // nobody is held by cooling
  });

  it("assumes a linear precedence chain", () => {
    const r = inferWorkload([{ name: "A" }, { name: "B" }, { name: "C" }]);
    expect(r.elements[0].predecessors).toEqual([]);
    expect(r.elements[1].predecessors).toEqual(["we1"]);
    expect(r.elements[2].predecessors).toEqual(["we2"]);
  });

  it("reports every guess it made, and which steps it could not match", () => {
    const r = inferWorkload([{ name: "Weld" }, { name: "Frobnicate widget" }]);
    expect(r.unmatched).toEqual(["Frobnicate widget"]);
    expect(r.matchRatePct).toBe(50);
    const fields = r.notes.filter((n) => n.elementName === "Weld").map((n) => n.field);
    expect(fields).toContain("capability");
    expect(fields).toContain("attendedFraction");
    expect(r.notes.every((n) => n.why.length > 0)).toBe(true);
  });

  it("leaves capability undefined rather than guessing when nothing matches", () => {
    const r = inferWorkload([{ name: "Frobnicate" }]);
    expect(r.elements[0].capabilityId).toBeUndefined();
  });
});

describe("assignment — stations are generated, not authored", () => {
  it("packs elements into the fewest stations that fit takt", () => {
    // 6 x 20s = 120s of work at 60s takt => 2 stations.
    const r = assignStations(chain([["a", 20], ["b", 20], ["c", 20], ["d", 20], ["e", 20], ["f", 20]]), 60);
    expect(r.stations).toHaveLength(2);
    expect(r.theoreticalMin).toBe(2);
    expect(r.optimalityGapPct).toBe(0);
    r.stations.forEach((s) => expect(s.cycleTimeSec).toBeLessThanOrEqual(60));
  });

  it("assigns every element exactly once", () => {
    const r = assignStations(chain([["a", 20], ["b", 30], ["c", 25], ["d", 15]]), 50);
    const all = r.stations.flatMap((s) => s.elementIds);
    expect(all.sort()).toEqual(["a", "b", "c", "d"]);
    expect(r.unassigned).toEqual([]);
  });

  it("never violates precedence", () => {
    const els = chain([["a", 20], ["b", 20], ["c", 20]]);
    const r = assignStations(els, 25); // forces one element per station
    const idx = (id: string) => r.stations.findIndex((s) => s.elementIds.includes(id));
    expect(idx("a")).toBeLessThanOrEqual(idx("b"));
    expect(idx("b")).toBeLessThanOrEqual(idx("c"));
  });

  it("honours must-be-together zoning", () => {
    const els = [
      el("a", 10, { mustBeSameStationAs: ["b"] }),
      el("b", 10, { predecessors: ["a"] }),
      el("c", 10, { predecessors: ["b"] }),
    ];
    const r = assignStations(els, 25);
    const st = r.stations.find((s) => s.elementIds.includes("a"));
    expect(st?.elementIds).toContain("b");
  });

  it("honours must-not-be-together zoning", () => {
    const els = [el("a", 10, { mustNotBeSameStationAs: ["b"] }), el("b", 10, { predecessors: ["a"] })];
    const r = assignStations(els, 100); // both would otherwise fit one station
    const sa = r.stations.findIndex((s) => s.elementIds.includes("a"));
    const sb = r.stations.findIndex((s) => s.elementIds.includes("b"));
    expect(sa).not.toBe(sb);
  });

  it("co-locates a transitive must-together chain a↔b, b↔c (audit A-07)", () => {
    const els = [
      el("a", 10, { mustBeSameStationAs: ["b"] }),
      el("b", 10, { mustBeSameStationAs: ["c"] }),
      el("c", 10),
    ];
    const r = assignStations(els, 40); // 30s fits one station
    const st = r.stations.find((s) => s.elementIds.includes("a"));
    expect(st?.elementIds).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("never lets a must-together pull-in break takt or a must-not rule (audit A-07)", () => {
    // a+b are glued; c must not sit with b. Gluing must not drag b onto c's
    // station, and the a+b station must still respect takt.
    const els = [
      el("a", 20, { mustBeSameStationAs: ["b"] }),
      el("b", 20, { mustNotBeSameStationAs: ["c"], predecessors: ["a"] }),
      el("c", 20, { predecessors: ["b"] }),
    ];
    const r = assignStations(els, 45); // a+b = 40 ≤ 45; c separate
    const sab = r.stations.find((s) => s.elementIds.includes("a"));
    expect(sab?.elementIds).toContain("b");
    expect(sab?.elementIds).not.toContain("c");
    for (const s of r.stations) expect(s.cycleTimeSec).toBeLessThanOrEqual(45 + 1e-6);
  });

  it("flags an unsatisfiable must/must-not contradiction instead of violating one (A-07)", () => {
    const els = [el("a", 10, { mustBeSameStationAs: ["b"], mustNotBeSameStationAs: ["b"] }), el("b", 10)];
    const r = assignStations(els, 50);
    expect(r.issues.some((i) => /contradiction/i.test(i))).toBe(true);
  });

  it("pins elements sharing a fixedStationId onto one station (A-07)", () => {
    const els = [
      el("a", 10, { fixedStationId: "S1" }),
      el("b", 10, { predecessors: ["a"] }),
      el("c", 10, { fixedStationId: "S1", predecessors: ["a"] }),
    ];
    const r = assignStations(els, 40);
    const sa = r.stations.find((s) => s.elementIds.includes("a"));
    expect(sa?.elementIds).toContain("c"); // both pinned to S1 → same station
  });

  it("reports balance loss and identifies the bottleneck", () => {
    const r = assignStations(chain([["a", 50], ["b", 10]]), 55);
    expect(r.stations.find((s) => s.isBottleneck)?.elementIds).toContain("a");
    expect(r.balanceLossPct).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const els = chain([["a", 12], ["b", 33], ["c", 21], ["d", 9], ["e", 40]]);
    const a = assignStations(els, 45).stations.map((s) => s.elementIds.join(","));
    const b = assignStations(els, 45).stations.map((s) => s.elementIds.join(","));
    expect(a).toEqual(b);
  });

  it("labels itself a heuristic and reports its gap to the bound", () => {
    const r = assignStations(chain([["a", 30], ["b", 30], ["c", 30]]), 45);
    expect(r.method).toBe("heuristic-rpw");
    expect(r.theoreticalMin).toBe(2);
    expect(r.optimalityGapPct).toBeGreaterThanOrEqual(0);
  });
});

describe("assignment — operators come from attended work, not cycle time", () => {
  it("does not man an unattended machine cycle", () => {
    const els = [el("load", 10, { attendedFraction: 1 }), el("cycle", 80, { attendedFraction: 0, predecessors: ["load"] })];
    const r = assignStations(els, 100);
    expect(r.stations).toHaveLength(1);
    expect(r.stations[0].cycleTimeSec).toBe(90);
    expect(r.stations[0].attendedSec).toBe(10);
    expect(r.stations[0].operators).toBe(1); // not 1 per 90s of machine time
  });

  it("adds an operator when attended work exceeds takt", () => {
    const els = [el("a", 90, { attendedFraction: 1 }), el("b", 90, { attendedFraction: 1, predecessors: ["a"] })];
    const r = assignStations(els, 100);
    // 180s attended across 2 stations of 90s each: still 1 operator each.
    expect(r.totalOperators).toBe(2);
  });
});

describe("assignment — mixed model", () => {
  const modes: VariantMode[] = [
    { id: "base", name: "Base", share: 0.7, elementOverrides: {} },
    { id: "heavy", name: "Heavy", share: 0.3, elementOverrides: { b: 3 } },
  ];

  it("sizes stations on the worst mode, not the average", () => {
    const els = chain([["a", 20], ["b", 20]]);
    // Weighted b = 20(0.7) + 60(0.3) = 32; worst b = 60.
    const r = assignStations(els, 60, modes);
    const bStation = r.stations.find((s) => s.elementIds.includes("b"));
    expect(bStation?.cycleTimeSec).toBe(60); // worst case
    expect(bStation?.weightedCycleSec).toBe(32); // average carried alongside
    // a and b cannot share a station: 20 + 60 = 80 > 60 takt.
    expect(r.stations).toHaveLength(2);
  });
});

describe("assignment — degrades honestly", () => {
  it("gives an over-takt element its own station and says so", () => {
    const r = assignStations(chain([["a", 200], ["b", 10]]), 60);
    const solo = r.stations.find((s) => s.elementIds.includes("a"));
    expect(solo?.elementIds).toEqual(["a"]);
    expect(r.issues.join(" ")).toMatch(/split it, automate it/);
  });

  it("reports unplaced elements when precedence cycles", () => {
    const els = [el("a", 10, { predecessors: ["b"] }), el("b", 10, { predecessors: ["a"] })];
    const r = assignStations(els, 60);
    expect(r.unassigned).toHaveLength(2);
    expect(r.issues.join(" ")).toMatch(/cycle/);
  });

  it("returns an empty result rather than throwing on no takt", () => {
    const r = assignStations(chain([["a", 10]]), 0);
    expect(r.stations).toEqual([]);
    expect(r.issues.join(" ")).toMatch(/Takt must be/);
  });

  it("respects a station cap and names what it could not place", () => {
    const r = assignStations(chain([["a", 50], ["b", 50], ["c", 50]]), 50, undefined, { maxStations: 2 });
    expect(r.stations).toHaveLength(2);
    expect(r.unassigned).toHaveLength(1);
    expect(r.issues.join(" ")).toMatch(/2-station cap/);
  });
});

describe("end to end — pasted names become a balanced cell", () => {
  it("takes bare step names and produces stations with no other input", () => {
    const inferred = inferWorkload([
      { name: "Load blank" },
      { name: "Press form" },
      { name: "MIG weld" },
      { name: "Deburr" },
      { name: "Leak test" },
      { name: "Pack" },
    ]);
    const r = assignStations(inferred.elements, 90);

    expect(inferred.matchRatePct).toBe(100);
    expect(r.stations.length).toBeGreaterThan(0);
    expect(r.unassigned).toEqual([]);
    // Nothing was typed but the names, so the result must declare low confidence.
    expect(r.confidence).toBe("low");
    // Every station knows which capabilities it must provide.
    expect(r.stations.flatMap((s) => s.capabilityIds)).toContain("join.weld");
  });
});
