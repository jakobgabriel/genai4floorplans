import { describe, it, expect } from "vitest";
import { parseSteps } from "./parseSteps";

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
