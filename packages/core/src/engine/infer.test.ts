import { describe, it, expect } from "vitest";
import { inferWorkload } from "./infer";

// The paste path infers everything; the rich process editor supplies explicit
// overrides. These tests pin that overrides win and stop being reported as guesses.

describe("inferWorkload — inference (paste path)", () => {
  it("matches a capability from the name and defaults a linear chain", () => {
    const r = inferWorkload([{ name: "Weld seam" }, { name: "Inspect" }]);
    expect(r.elements[0].capabilityId).toBe("join.weld");
    expect(r.elements[1].predecessors).toEqual(["we1"]);
    // Everything was inferred, so each field carries a note.
    expect(r.notes.some((n) => n.field === "capability")).toBe(true);
  });
});

describe("inferWorkload — explicit overrides", () => {
  it("uses an explicit capability and drops its inference note", () => {
    const r = inferWorkload([{ name: "Mystery op", capabilityId: "join.weld" }]);
    expect(r.elements[0].capabilityId).toBe("join.weld");
    expect(r.notes.some((n) => n.elementId === "we1" && n.field === "capability")).toBe(false);
    // An explicit capability means the step is no longer "unmatched".
    expect(r.unmatched).not.toContain("Mystery op");
  });

  it("honours classification, waste class, attended fraction and ergonomics", () => {
    const r = inferWorkload([
      { name: "Weld", classification: "NVA", wasteClass: "waiting", attendedFraction: 0.1, ergonomicLoad: "heavy" },
    ]);
    const e = r.elements[0];
    expect(e.classification).toBe("NVA");
    expect(e.wasteClass).toBe("waiting");
    expect(e.attendedFraction).toBe(0.1);
    expect(e.ergonomicLoad).toBe("heavy");
    // None of the overridden fields is reported as a guess.
    expect(r.notes.some((n) => ["classification", "attendedFraction", "ergonomics"].includes(n.field))).toBe(false);
  });

  it("derives seconds from a supplied cycle decomposition and carries the method", () => {
    const r = inferWorkload([
      { name: "Assemble", cycle: { valueAddSec: 20, handlingSec: 5, walkSec: 2, waitSec: 3, setupSec: 0 }, timeMethod: "MTM", confidence: "high" },
    ]);
    expect(r.elements[0].time.seconds).toBe(30);
    expect(r.elements[0].time.method).toBe("MTM");
    expect(r.elements[0].time.confidence).toBe("high");
    expect(r.notes.some((n) => n.field === "time")).toBe(false);
  });

  it("expresses a non-linear DAG from explicit predecessors", () => {
    const r = inferWorkload([
      { name: "A" },
      { name: "B", predecessors: [] }, // parallel to A — no predecessor
      { name: "C", predecessors: [0, 1] }, // joins A and B
    ]);
    expect(r.elements[1].predecessors).toEqual([]);
    expect(r.elements[2].predecessors).toEqual(["we1", "we2"]);
  });

  it("ignores forward/self predecessor references", () => {
    const r = inferWorkload([{ name: "A", predecessors: [0, 2] }, { name: "B" }]);
    expect(r.elements[0].predecessors).toEqual([]);
  });

  it("carries a scrap rate onto the element", () => {
    const r = inferWorkload([{ name: "Press", scrapRate: 0.03 }]);
    expect(r.elements[0].scrapRate).toBe(0.03);
  });
});
