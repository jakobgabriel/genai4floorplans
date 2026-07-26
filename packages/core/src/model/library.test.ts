import { describe, it, expect } from "vitest";
import {
  blankProcess,
  fromCapabilities,
  processFromName,
  routingStepFrom,
  stationFromProcess,
  type LibraryProcess,
} from "./library";
import { CAPABILITY_HINTS, matchHint } from "../engine/infer";
import { blankModel } from "./sample";

const model = blankModel();

describe("a new entry", () => {
  it("starts blank, with no tags and no custom fields", () => {
    const p = blankProcess("lib_1");
    expect(p.tags).toEqual([]);
    expect(p.custom).toEqual([]);
    expect(p.name).toBe("New process");
  });

  it("fills itself in from the name, using the same catalog inference uses", () => {
    const p = processFromName("lib_1", "MIG weld");
    expect(p.capabilityId).toBe("join.weld");
    expect(p.cycleTimeSec).toBe(55);
    expect(p.classification).toBe("VA");
    expect(p.auto).toBe("semi"); // 60% attended
  });

  it("stays neutral when the name matches nothing", () => {
    const p = processFromName("lib_1", "Zzyzx");
    expect(p.capabilityId).toBe("unknown");
    expect(p).toMatchObject({ cycleTimeSec: 30, operators: 1, type: "machine" });
  });
});

// There is no seed. The catalog is an import a planner chooses, and what it
// produces has to be ordinary entries — no flag, nothing marking them as not
// yours, and nothing the tool treats differently.
describe("importing the built-in capabilities", () => {
  const imported = fromCapabilities(CAPABILITY_HINTS, (i) => "lib_" + i);

  it("produces one ordinary entry per capability", () => {
    expect(imported).toHaveLength(CAPABILITY_HINTS.length);
    imported.forEach((p) => {
      expect(p.tags).toEqual([]);
      expect(p.custom).toEqual([]);
      expect(Object.keys(p)).not.toContain("seeded");
    });
  });

  it("carries the seconds and classification the inference would have used", () => {
    CAPABILITY_HINTS.forEach((h) => {
      const p = imported.find((x) => x.capabilityId === h.capabilityId)!;
      expect(p.cycleTimeSec).toBe(h.defaultSeconds);
      expect(p.classification).toBe(h.classification);
      expect(p.attendedFraction).toBe(h.attendedFraction);
    });
  });

  // The property that keeps the two catalogs from drifting: a label has to be
  // a name the keyword matcher can classify back. "Machining" was not — the
  // keywords are the operations, not the family — so a step placed from that
  // entry came back as unknown.
  it("round-trips through the keyword matcher", () => {
    imported.forEach((p) => {
      const hit = matchHint(p.name);
      expect(hit, `no keyword matched "${p.name}"`).not.toBeNull();
      expect(hit!.capabilityId).toBe(p.capabilityId);
    });
  });
});

describe("stationFromProcess", () => {
  const weld = processFromName("lib_w", "MIG weld");

  it("carries the library's numbers instead of the blank-station defaults", () => {
    const st = stationFromProcess(model, weld);
    expect(st.name).toBe("MIG weld");
    expect(st.cycleTimeSec).toBe(weld.cycleTimeSec);
    expect(st.type).toBe("machine");
    expect(st.role).toBe("process");
    expect(st.auto).toBe("semi");
  });

  // Everything the Element panel edits that belongs to the process rather than
  // to its position — the point of the library is not retyping any of it.
  it("carries every process-intrinsic field the station editor exposes", () => {
    const p: LibraryProcess = {
      ...blankProcess("lib_x", "Broach"),
      role: "process",
      type: "quality",
      auto: "auto",
      cycleTimeSec: 88,
      operators: 2,
      changeoverMin: 17,
      ergoRisk: "high",
      capex: 125000,
      automationCapex: 40000,
      energyKw: 7.5,
      footprintW: 5,
      footprintH: 4,
      utilities: ["power", "air", "water"],
      scrapRate: 0.03,
      notes: "Runs off the night programme",
    };
    const st = stationFromProcess(model, p);
    expect(st).toMatchObject({
      name: "Broach",
      role: "process",
      type: "quality",
      auto: "auto",
      cycleTimeSec: 88,
      operators: 2,
      changeoverMin: 17,
      ergoRisk: "high",
      capex: 125000,
      automationCapex: 40000,
      energyKw: 7.5,
      w: 5,
      h: 4,
      scrapRate: 0.03,
    });
    expect(st.utilities).toEqual(["power", "air", "water"]);
  });

  it("writes the planner's own fields into the notes, where a human reads them", () => {
    const p = {
      ...blankProcess("lib_c", "Press"),
      notes: "Line 3",
      custom: [
        { id: "f1", label: "Tool no.", value: "T-4471" },
        { id: "f2", label: "", value: "" },
      ],
    };
    const st = stationFromProcess(model, p);
    expect(st.notes).toBe("Line 3\nTool no.: T-4471");
  });

  it("gives each placement its own id", () => {
    const a = stationFromProcess(model, weld);
    const b = stationFromProcess({ ...model, stations: [a] }, weld);
    expect(a.id).not.toBe(b.id);
  });
});

describe("routingStepFrom", () => {
  // ProcessStep carries more than a name and a time; the generator reads the
  // station type, the ergonomics and the scrap rate off it too.
  it("hands the generator everything it can read, not just the name", () => {
    const p = { ...blankProcess("lib_t", "Leak test"), type: "quality" as const, ergoRisk: "med" as const, cycleTimeSec: 25, scrapRate: 0.02 };
    expect(routingStepFrom(p)).toEqual({
      name: "Leak test",
      cycleTimeSec: 25,
      type: "quality",
      ergoRisk: "med",
      scrapRate: 0.02,
    });
  });

  it("leaves scrap undefined when there is none, rather than asserting zero", () => {
    expect(routingStepFrom(blankProcess("lib_z", "Press")).scrapRate).toBeUndefined();
  });
});
