import { describe, it, expect } from "vitest";
import { DEFAULT_CATALOG, catalogStationPatch, PROCESS_CATEGORIES } from "./catalog";

describe("process catalog", () => {
  it("seeds a catalog covering every category", () => {
    const cats = new Set(DEFAULT_CATALOG.map((e) => e.category));
    for (const c of PROCESS_CATEGORIES) expect(cats.has(c)).toBe(true);
  });

  it("a catalog entry becomes a station patch carrying its standards", () => {
    const leak = DEFAULT_CATALOG.find((e) => e.id === "cat-leak-test")!;
    const patch = catalogStationPatch(leak);
    expect(patch.name).toBe("Leak test rig (autonomous)");
    expect(patch.type).toBe("quality");
    expect(patch.cycleTimeSec).toBe(90);
    expect(patch.role).toBe("process");
    // Capability is provided N:M — never a 1:1 workcenter.
    expect(patch.provides).toEqual(["leaktest"]);
    // The standard's provenance rides along.
    expect(patch.dataQuality).toEqual({ cycleTimeSec: "measured" });
    // Machine investment maps to capex.
    expect(patch.capex).toBe(80000);
  });

  it("never emits a workcenter field (1:1 is prohibited)", () => {
    for (const e of DEFAULT_CATALOG) {
      const patch = catalogStationPatch(e);
      expect("workcenter" in patch).toBe(false);
    }
  });
});
