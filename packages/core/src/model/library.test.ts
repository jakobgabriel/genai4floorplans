import { describe, it, expect } from "vitest";
import { SEED_LIBRARY, blankProcess, routingStep, stationFromProcess } from "./library";
import { CAPABILITY_HINTS, matchHint } from "../engine/infer";
import { blankModel } from "./sample";

describe("process library seed", () => {
  it("gives every capability the engine can infer a pickable entry", () => {
    expect(SEED_LIBRARY).toHaveLength(CAPABILITY_HINTS.length);
    const ids = new Set(SEED_LIBRARY.map((p) => p.capabilityId));
    CAPABILITY_HINTS.forEach((h) => expect(ids.has(h.capabilityId)).toBe(true));
  });

  it("carries the same seconds and classification the inference would have used", () => {
    CAPABILITY_HINTS.forEach((h) => {
      const p = SEED_LIBRARY.find((x) => x.capabilityId === h.capabilityId)!;
      expect(p.cycleTimeSec).toBe(h.defaultSeconds);
      expect(p.classification).toBe(h.classification);
      expect(p.attendedFraction).toBe(h.attendedFraction);
    });
  });

  // The point of deriving the seed rather than hand-writing it: a seeded entry
  // placed into a routing must classify back to the capability it came from.
  it("round-trips through the keyword matcher", () => {
    SEED_LIBRARY.forEach((p) => {
      const hit = matchHint(p.name);
      expect(hit, `no keyword matched "${p.name}"`).not.toBeNull();
      expect(hit!.capabilityId).toBe(p.capabilityId);
    });
  });

  it("writes a routing step the parts matrix can parse back", () => {
    const press = SEED_LIBRARY.find((p) => p.capabilityId === "form.press")!;
    expect(routingStep(press)).toBe("Press 30");
  });
});

describe("stationFromProcess", () => {
  const model = blankModel();

  it("carries the library's numbers instead of the blank-station defaults", () => {
    const weld = SEED_LIBRARY.find((p) => p.capabilityId === "join.weld")!;
    const st = stationFromProcess(model, weld);
    expect(st.name).toBe("Weld");
    expect(st.cycleTimeSec).toBe(weld.cycleTimeSec);
    expect(st.type).toBe("machine");
    expect(st.role).toBe("process");
  });

  it("reads the automation state off how much of the cycle binds an operator", () => {
    const load = SEED_LIBRARY.find((p) => p.capabilityId === "handle.load")!; // 100% attended
    expect(stationFromProcess(model, load).auto).toBe("manual");
    expect(stationFromProcess(model, load).operators).toBe(1);

    const machining = SEED_LIBRARY.find((p) => p.capabilityId === "cut.machining")!; // 20%
    expect(stationFromProcess(model, machining).auto).toBe("semi");

    const wait = SEED_LIBRARY.find((p) => p.capabilityId === "wait.queue")!; // 0%
    expect(stationFromProcess(model, wait).auto).toBe("auto");
    expect(stationFromProcess(model, wait).operators).toBe(0);
  });

  it("gives each placement its own id", () => {
    const p = blankProcess("lib_x");
    const a = stationFromProcess(model, p);
    const b = stationFromProcess({ ...model, stations: [a] }, p);
    expect(a.id).not.toBe(b.id);
  });
});
