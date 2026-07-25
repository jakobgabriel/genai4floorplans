import { describe, it, expect } from "vitest";
import { parseModelText, modelToJSON } from "./json";
import { migrate } from "../model/migrate";
import { SAMPLE } from "../model/sample";
import { SCHEMA_VERSION } from "../model/types";

describe("JSON import", () => {
  it("round-trips the sample model", () => {
    const res = parseModelText(modelToJSON(SAMPLE));
    expect(res.ok).toBe(true);
    expect(res.model?.stations).toHaveLength(SAMPLE.stations.length);
    expect(res.model?.flows).toHaveLength(SAMPLE.flows.length);
  });

  it("rejects non-JSON with a friendly error", () => {
    const res = parseModelText("{not json");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/valid JSON/i);
  });

  it("rejects a model missing the stations array", () => {
    const res = parseModelText(JSON.stringify({ flows: [] }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/stations/i);
  });

  it("fills missing station fields with defaults", () => {
    const res = parseModelText(JSON.stringify({ stations: [{ id: "a" }], flows: [] }));
    expect(res.ok).toBe(true);
    const a = res.model!.stations[0];
    expect(a.role).toBe("process");
    expect(a.w).toBeGreaterThan(0);
  });

  // These three used to import clean: a flow to a nonexistent station scored
  // grade A on a broken graph, two stations shared an id, and a file from a
  // newer build normalized against today's rules and looked valid.
  it("rejects a flow pointing at a station that does not exist, naming it", () => {
    const res = parseModelText(JSON.stringify({ stations: [{ id: "a" }], flows: [{ from: "a", to: "GHOST" }] }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/GHOST/);
  });

  it("rejects duplicate station ids, naming the id", () => {
    const res = parseModelText(JSON.stringify({ stations: [{ id: "a" }, { id: "a" }], flows: [] }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/duplicate.*'a'/i);
  });

  it("rejects a file from a newer schema rather than mis-reading it", () => {
    const res = parseModelText(JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, stations: [{ id: "a" }], flows: [] }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(new RegExp(String(SCHEMA_VERSION + 1)));
    expect(res.error).toMatch(/newer version/i);
  });
});

describe("migration", () => {
  it("upgrades a legacy (pre-versioned) model and preserves data", () => {
    const legacy = {
      name: "Legacy",
      gridW: 20,
      gridH: 12,
      stations: [{ id: "a", name: "A", role: "input" }],
      flows: [{ from: "a", to: "a" }],
    };
    const m = migrate(legacy);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.shiftHours).toBe(8);
    expect(m.stations[0].id).toBe("a");
    expect(m.gridW).toBe(20);
  });
});
