import type { Model } from "@flowplan/core/model/types";
import { SCHEMA_VERSION } from "@flowplan/core/model/types";
import { migrate } from "@flowplan/core/model/migrate";

// Cells/scenarios store the Model as JSONB. On read, lazily migrate if the
// denormalized schemaVersion is behind; on write, stamp the current version.
export function migrateStored(model: unknown, storedVersion: number): Model {
  if (storedVersion >= SCHEMA_VERSION) return model as Model;
  return migrate(model);
}

export function versionOf(model: Model): number {
  return model.schemaVersion ?? SCHEMA_VERSION;
}

// The Model interface lacks an index signature, so Prisma's InputJsonValue type
// rejects it directly. It is plain JSON at runtime, so cast at the write seam.
export function asJson(model: Model): object {
  return model as unknown as object;
}

export { SCHEMA_VERSION };
