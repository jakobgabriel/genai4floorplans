import { describe, it, expect } from "vitest";
import { migrate } from "./migrate";
import { SAMPLE } from "./sample";
import {
  SCHEMA_VERSION,
  fieldQuality,
  qualityConfidence,
  stationConfidence,
  type Station,
} from "./types";

function station(over: Partial<Station>): Station {
  return {
    id: "s",
    name: "S",
    role: "process",
    type: "machine",
    x: 0,
    y: 0,
    w: 3,
    h: 2,
    fixed: false,
    auto: "manual",
    autoOverride: null,
    capacityPerShift: 1000,
    operators: 1,
    cycleTimeSec: 30,
    changeoverMin: 10,
    ergoRisk: "low",
    utilities: [],
    notes: "",
    ...over,
  };
}

describe("data quality (spec §5)", () => {
  it("an unmarked field reads as estimated — an unmarked number is suspect", () => {
    expect(fieldQuality(station({}), "cycleTimeSec")).toBe("estimated");
    expect(fieldQuality(station({ dataQuality: {} }), "capex")).toBe("estimated");
  });

  it("a marked field returns its stored quality", () => {
    const s = station({ dataQuality: { cycleTimeSec: "measured", capex: "benchmarked" } });
    expect(fieldQuality(s, "cycleTimeSec")).toBe("measured");
    expect(fieldQuality(s, "capex")).toBe("benchmarked");
    expect(fieldQuality(s, "energyKw")).toBe("estimated");
  });

  it("quality maps to the confidence it propagates as", () => {
    expect(qualityConfidence("measured")).toBe("high");
    expect(qualityConfidence("benchmarked")).toBe("med");
    expect(qualityConfidence("estimated")).toBe("low");
  });

  it("a station propagates the weakest confidence across its fields", () => {
    // All measured -> high.
    const firm = station({
      dataQuality: {
        cycleTimeSec: "measured",
        capex: "measured",
        energyKw: "measured",
        capacityPerShift: "measured",
        changeoverMin: "measured",
      },
    });
    expect(stationConfidence(firm)).toBe("high");
    // One estimated field drags the whole station to low.
    const mixed = station({ dataQuality: { cycleTimeSec: "measured", capex: "measured" } });
    expect(stationConfidence(mixed, ["cycleTimeSec", "capex"])).toBe("high");
    expect(stationConfidence(mixed)).toBe("low"); // energyKw etc. unmarked -> estimated
  });
});

describe("migration v8 -> v9", () => {
  it("bumps a v8 model to the current version without touching numbers", () => {
    const v8 = {
      schemaVersion: 8,
      name: "L",
      gridW: 10,
      gridH: 10,
      noGoZones: [],
      flows: [],
      stations: [{ id: "a", cycleTimeSec: 12 }],
    };
    const m = migrate(v8);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(9);
    // dataQuality stays sparse (absent) — no materialised defaults.
    expect(m.stations[0].dataQuality).toBeUndefined();
    expect(m.stations[0].cycleTimeSec).toBe(12);
  });

  it("the demo sample carries a realistic measured/benchmarked/estimated mix", () => {
    const byId = Object.fromEntries(SAMPLE.stations.map((s) => [s.id, s]));
    expect(fieldQuality(byId.cnc, "cycleTimeSec")).toBe("measured");
    expect(fieldQuality(byId.qa, "cycleTimeSec")).toBe("benchmarked");
    expect(fieldQuality(byId.assembly, "cycleTimeSec")).toBe("estimated");
  });
});
