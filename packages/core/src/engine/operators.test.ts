import { describe, it, expect } from "vitest";
import type { Station } from "../model/types";
import { operatorPaceLanes } from "./balance";

const s = (type: Station["type"], operators: number): Pick<Station, "type" | "operators"> => ({ type, operators });

describe("fractional operators (shared / split manning)", () => {
  it("keeps integer manual operators as whole throughput lanes (golden-preserving)", () => {
    expect(operatorPaceLanes(s("manual", 1))).toBe(1);
    expect(operatorPaceLanes(s("manual", 2))).toBe(2);
    expect(operatorPaceLanes(s("manual", 3))).toBe(3);
  });

  it("rounds a fractional manual operator to whole lanes — never a partial lane", () => {
    expect(operatorPaceLanes(s("manual", 0.3))).toBe(1); // a shared worker still runs the bench
    expect(operatorPaceLanes(s("manual", 1.6))).toBe(2);
    expect(operatorPaceLanes(s("manual", 2.4))).toBe(2);
  });

  it("never lets operators multiply a machine's throughput, fractional or not", () => {
    expect(operatorPaceLanes(s("machine", 0.3))).toBe(1);
    expect(operatorPaceLanes(s("machine", 2))).toBe(1);
    expect(operatorPaceLanes(s("quality", 0.6))).toBe(1);
  });
});
