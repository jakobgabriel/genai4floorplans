import { describe, it, expect } from "vitest";
import { formatRouting, parseRouting, parseSteps } from "./parseSteps";

describe("parseSteps", () => {
  it("parses tab-separated Excel paste", () => {
    expect(parseSteps("Blank\t25\nWeld\t55")).toEqual([
      { name: "Blank", cycleTimeSec: 25 },
      { name: "Weld", cycleTimeSec: 55 },
    ]);
  });

  it("accepts commas, semicolons and bare spaces", () => {
    expect(parseSteps("Blank, 25\nForm; 40\nWeld 55").map((s) => s.cycleTimeSec)).toEqual([25, 40, 55]);
    expect(parseSteps("Blank, 25").map((s) => s.name)).toEqual(["Blank"]);
  });

  it("tolerates a unit suffix and a decimal comma", () => {
    expect(parseSteps("Press 12.5s").map((s) => s.cycleTimeSec)).toEqual([12.5]);
    expect(parseSteps("Press 12,5").map((s) => s.cycleTimeSec)).toEqual([12.5]);
  });

  it("leaves the time unset for a bare name so inference can supply it", () => {
    // A blanket 30s default would be worse than a capability-appropriate one.
    expect(parseSteps("Deburr")).toEqual([{ name: "Deburr", cycleTimeSec: undefined }]);
  });

  it("skips blank lines and trims whitespace", () => {
    expect(parseSteps("  Blank\t25  \n\n\n  Weld\t55\n")).toHaveLength(2);
  });

  it("keeps multi-word names intact", () => {
    expect(parseSteps("CNC rough turn\t42")[0].name).toBe("CNC rough turn");
  });
});

describe("parseRouting", () => {
  it("splits a one-line routing on arrows or commas", () => {
    expect(parseRouting("Load 5 > Press 10 > Weld 20").map((s) => s.name)).toEqual(["Load", "Press", "Weld"]);
    expect(parseRouting("Load, Press, Weld").map((s) => s.name)).toEqual(["Load", "Press", "Weld"]);
    expect(parseRouting("Load 5 → Press 10").map((s) => s.name)).toEqual(["Load", "Press"]);
  });

  it("reads a cycle time after a space or a colon", () => {
    expect(parseRouting("Press 12")[0].cycleTimeSec).toBe(12);
    expect(parseRouting("Press:12")[0].cycleTimeSec).toBe(12);
    expect(parseRouting("Press 12s")[0].cycleTimeSec).toBe(12);
  });

  it("leaves the cycle undefined when none was given, so inference supplies it", () => {
    expect(parseRouting("Deburr")[0].cycleTimeSec).toBeUndefined();
  });

  it("round-trips through formatRouting", () => {
    const r = parseRouting("Load 5 > Press 10");
    expect(formatRouting(r)).toBe("Load 5 > Press 10");
    expect(parseRouting(formatRouting(r))).toEqual(r);
  });
});
