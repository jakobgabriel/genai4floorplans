import type { Model } from "./types";
import { SCHEMA_VERSION } from "./types";
import { normalizeModel } from "./defaults";

// Migration pipeline so old/legacy JSON (including pre-versioned demo files that
// have no schemaVersion) keeps loading. Each step upgrades one version forward.
// Add a new function and register it here when the schema changes.

type Migration = (m: Record<string, unknown>) => Record<string, unknown>;

// version 0 (or absent) -> 1: introduce schemaVersion + shiftHours defaults.
const toV1: Migration = (m) => ({
  ...m,
  schemaVersion: 1,
  shiftHours: typeof m.shiftHours === "number" ? m.shiftHours : 8,
});

// version 1 -> 2: introduce optional per-model rating weights (absent => engine
// defaults, so existing models keep their exact grade).
const toV2: Migration = (m) => ({ ...m, schemaVersion: 2 });

// version 2 -> 3: introduce station ports (in/out/scrap sides), scrapRate, and
// freeform cell footprints. All default inertly (rect, scrap 0), so ratings are
// unchanged; normalizeStation fills the new fields.
const toV3: Migration = (m) => ({ ...m, schemaVersion: 3 });

// version 3 -> 4: parallel processing — parallelUnits, splitMode/mergeMode, and
// per-flow share/unitsPerAssembly. Inert defaults (1 unit, distribute/sum), so a
// serial line's throughput math is unchanged.
const toV4: Migration = (m) => ({ ...m, schemaVersion: 4 });

// version 4 -> 5: cost/ROI fields (capex, automationCapex, energyKw, costConfig).
// Default to 0 / standard assumptions, so nothing in the rating changes.
const toV5: Migration = (m) => ({ ...m, schemaVersion: 5 });

// version 5 -> 6: optional cycle-time decomposition (Station.cycle). Absent on
// every existing station, so effectiveCycleSec falls back to cycleTimeSec and
// balance/rating numbers are unchanged.
const toV6: Migration = (m) => ({ ...m, schemaVersion: 6 });

// version 6 -> 7: products, volume scenarios and volumeMode. volumeMode is
// absent (⇒ "explicit"), so stored flow volumes stay authoritative and nothing
// is re-derived on load.
const toV7: Migration = (m) => ({ ...m, schemaVersion: 7 });

// version 7 -> 8: workload (WorkElement) and mixed-model variant modes. Both
// absent on every existing model, so nothing is balanced differently on load.
const toV8: Migration = (m) => ({ ...m, schemaVersion: 8 });

// version 8 -> 9: per-field data quality on stations (spec §5). Sparse and
// absent on every existing station, so a missing entry is treated as
// "estimated" at render — an unmarked number reads as suspect, which is the
// intended honest default. Purely metadata: no engine number changes, so grades
// and golden fixtures are unaffected.
const toV9: Migration = (m) => ({ ...m, schemaVersion: 9 });

// version 9 -> 10: flow kinds (good/nok/rwk) for the four separated material
// paths. Absent on every existing flow (⇒ "good"), so no analysis changes.
const toV10: Migration = (m) => ({ ...m, schemaVersion: 10 });

// version 10 -> 11: multi-year demand + shift model for capacity analysis.
// Absent on every existing model, so no analysis changes on load.
const toV11: Migration = (m) => ({ ...m, schemaVersion: 11 });

// version 11 -> 12: zone kinds on NoGoZone (blocking/spacer/aisle/wall/column/
// esd). Absent on every existing zone (⇒ "blocking"), so a legacy no-go zone
// stays an obstacle and placement/floor-space are unchanged on load.
const toV12: Migration = (m) => ({ ...m, schemaVersion: 12 });

// version 12 -> 13: documentation groups (labelled/commented annotation boxes).
// Absent on every existing model (⇒ none), so nothing renders or changes on load.
const toV13: Migration = (m) => ({ ...m, schemaVersion: 13 });

// version 13 -> 14: layout-realism envelope (audit C-03) — optional station
// clearance/weightKg and model floorLoadKgPerM2/aisleWidth. All absent on every
// existing model (⇒ checks skipped), so nothing changes on load.
const toV14: Migration = (m) => ({ ...m, schemaVersion: 14 });

// version 14 -> 15: envelope polygon + obstacle movable/moveCost (audit C-03
// inc2). All absent on existing models (⇒ full-grid floor, fixed obstacles).
const toV15: Migration = (m) => ({ ...m, schemaVersion: 15 });

// version 15 -> 16: operator loops (audit C-13) — optional station
// attendedFraction/operatorId and model walkSpeedMps. Absent on existing models
// (⇒ type-default attended fraction, no explicit loops), so nothing changes.
const toV16: Migration = (m) => ({ ...m, schemaVersion: 16 });

// version 16 -> 17: equipment availability (audit C-02) — optional station
// availabilityPct / mtbfHours / mttrHours. Absent ⇒ availability 1, no change.
const toV17: Migration = (m) => ({ ...m, schemaVersion: 17 });

const MIGRATIONS: Record<number, Migration> = {
  0: toV1,
  1: toV2,
  2: toV3,
  3: toV4,
  4: toV5,
  5: toV6,
  6: toV7,
  7: toV8,
  8: toV9,
  9: toV10,
  10: toV11,
  11: toV12,
  12: toV13,
  13: toV14,
  14: toV15,
  15: toV16,
  16: toV17,
};

export function migrate(raw: unknown): Model {
  if (!raw || typeof raw !== "object") {
    throw new Error("Model must be a JSON object.");
  }
  let obj = raw as Record<string, unknown>;
  let version = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 0;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break; // no migration registered — fall through to normalization
    obj = step(obj);
    version = typeof obj.schemaVersion === "number" ? obj.schemaVersion : version + 1;
  }
  // normalizeModel fills any still-missing fields with defaults.
  return normalizeModel(obj as Partial<Model> & { stations?: unknown; flows?: unknown });
}
