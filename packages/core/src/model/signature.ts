import type { Model } from "./types";

// Stable signature of a layout: positions plus the fields that affect the
// rating. Two models with the same signature score identically.
//
// Lives in the model layer, not in ai/, because both the AI path and the
// optimizer path need it — the AI to de-duplicate candidates, the optimizer to
// tell whether an outstanding proposal has gone stale (spec §4). Engine code
// must not import from ai/ (§29 layering).

export function layoutSignature(m: Model): string {
  return m.stations
    .map((s) =>
      [s.id, s.x, s.y, s.w, s.h, s.role, s.auto, s.operators, s.cycleTimeSec, s.fixed, s.parallelUnits ?? 1, s.splitMode ?? "distribute", s.mergeMode ?? "sum"].join(":"),
    )
    .sort()
    .join("|") +
    "#" +
    m.flows.map((f) => [f.from, f.to, f.transport, f.volume, f.share ?? "", f.unitsPerAssembly ?? 1].join(":")).sort().join("|");
}
