import type { Model, StationDataField } from "../model/types";
import { fieldQuality } from "../model/types";

// Open points (blueprint §4.1 / §11). The output form of the confidence flags:
// every estimated input that investment would follow, listed as an action to
// secure before release — "Time for operation 130 is estimated, not measured —
// secure before investment release." Generated from the flags, never typed.

export type OpenPointSeverity = "block" | "warn";

export interface OpenPoint {
  id: string;
  text: string;
  severity: OpenPointSeverity;
  /** Station or element the point refers to, for click-through. */
  ref?: string;
}

// Only the numbers investment actually follows raise a release action. Capacity,
// changeover and energy are markable in the inspector but too routinely
// unmeasured to be release-blockers — flagging them all would be noise.
const RELEASE_FIELDS: StationDataField[] = ["cycleTimeSec", "capex"];
const FIELD_LABEL: Record<string, string> = {
  cycleTimeSec: "Cycle time",
  capex: "Equipment capex",
};

/** Whether a field carries a value worth flagging (a zero capex is not a risk). */
function relevant(value: number | undefined): boolean {
  return typeof value === "number" && value !== 0;
}

export function openPoints(model: Model): OpenPoint[] {
  const points: OpenPoint[] = [];

  for (const s of model.stations) {
    if (s.role !== "process") continue;
    for (const field of RELEASE_FIELDS) {
      if (fieldQuality(s, field) !== "estimated") continue;
      const value = s[field as keyof typeof s] as number | undefined;
      if (!relevant(value)) continue; // a zero capex is not a risk
      points.push({
        id: `${s.id}:${field}`,
        ref: s.id,
        severity: "block",
        text: `${FIELD_LABEL[field]} for ${s.name} is estimated, not measured — secure before investment release.`,
      });
    }
  }

  for (const el of model.workElements ?? []) {
    if (el.time.confidence === "low" || el.time.method === "estimate") {
      points.push({
        id: `we:${el.id}`,
        ref: el.id,
        severity: "block",
        text: `Time for "${el.name}" is ${el.time.method === "estimate" ? "estimated" : "low-confidence"} — secure before investment release.`,
      });
    }
  }

  return points;
}
