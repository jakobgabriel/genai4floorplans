import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { openPoints } from "./openpoints";

describe("openPoints (blueprint §4.1)", () => {
  it("flags the sample's estimated assembly cycle, not its measured cnc cycle", () => {
    const pts = openPoints(SAMPLE);
    const refs = pts.map((p) => p.ref);
    expect(refs).toContain("assembly"); // estimated cycle
    expect(refs).not.toContain("cnc"); // measured
    expect(refs).not.toContain("press"); // measured
    // qa cycle is benchmarked (not estimated) → no cycle point for it.
    expect(pts.find((p) => p.id === "qa:cycleTimeSec")).toBeUndefined();
  });

  it("generates the release sentence, not a raw field name", () => {
    const pt = openPoints(SAMPLE).find((p) => p.ref === "assembly");
    expect(pt?.text).toMatch(/secure before investment release/);
    expect(pt?.severity).toBe("block");
  });

  it("does not flag a zero-valued capex just because it is unmarked", () => {
    // SAMPLE stations have capex 0 and no capex quality → estimated, but zero.
    const capexPoints = openPoints(SAMPLE).filter((p) => p.id.endsWith(":capex"));
    expect(capexPoints).toHaveLength(0);
  });
});
