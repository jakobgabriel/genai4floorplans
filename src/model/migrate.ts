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

const MIGRATIONS: Record<number, Migration> = {
  0: toV1,
  1: toV2,
  2: toV3,
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
