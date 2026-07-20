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

const MIGRATIONS: Record<number, Migration> = {
  0: toV1,
  1: toV2,
  2: toV3,
  3: toV4,
  4: toV5,
  5: toV6,
  6: toV7,
  7: toV8,
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
