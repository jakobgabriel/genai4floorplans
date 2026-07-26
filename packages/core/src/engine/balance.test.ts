import { describe, it, expect } from "vitest";
import type { Station } from "../model/types";
import { normalizeFlow, normalizeStation } from "../model/defaults";
import { balanceAnalysis, stationRate } from "./balance";
describe("mixed-flow utilisation", () => {
  // A station sized for a 60s worst part but running a mix that averages 40s.
  const mixed = (over: Partial<Station> = {}): Station =>
    normalizeStation({
      id: "st1",
      name: "Press",
      role: "process",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      cycleTimeSec: 60,
      mixCycleSec: 40,
      operators: 1,
      capacityPerShift: 0,
      ...over,
    } as Station);

  it("rates a step on the mix it runs, not the heaviest part it must clear", () => {
    // 8h at 40s = 720/shift; at the 60s worst mode it would read 480.
    expect(stationRate(mixed(), 8)).toBe(720);
  });

  it("keeps the sized cycle visible next to the one it runs at", () => {
    const stations = [
      normalizeStation({ id: "in", name: "In", role: "input", x: 0, y: 0, w: 2, h: 2, capacityPerShift: 10000 } as Station),
      mixed(),
      normalizeStation({ id: "out", name: "Out", role: "output", x: 9, y: 0, w: 2, h: 2, capacityPerShift: 10000 } as Station),
    ];
    const flows = [
      normalizeFlow({ from: "in", to: "st1", volume: 100, unitCost: 1 }),
      normalizeFlow({ from: "st1", to: "out", volume: 100, unitCost: 1 }),
    ];
    const step = balanceAnalysis(stations, flows, 8).steps.find((s) => s.id === "st1")!;
    expect(step.cycle).toBe(40); // what it runs
    expect(step.sizedCycle).toBe(60); // what it was bought for
  });

  it("falls back to the sized cycle when there is no mix", () => {
    const single = mixed({ mixCycleSec: undefined });
    expect(stationRate(single, 8)).toBe(480);
  });
});
