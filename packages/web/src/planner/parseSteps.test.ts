import { describe, it, expect } from "vitest";
import { formatRouting, parseRouting } from "./parseSteps";

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
