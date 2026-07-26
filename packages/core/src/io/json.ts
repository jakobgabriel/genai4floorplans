import type { Model } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { migrate } from "../model/migrate";

export interface ParseResult {
  ok: boolean;
  model?: Model;
  error?: string;
}

// Non-destructive import (spec robustness): parse + validate text, returning a
// result the caller can preview before replacing the current model. Never throws
// to the UI; bad input yields a specific, friendly error message. Pure / isomorphic.
export function parseModelText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "Not valid JSON: " + (e as Error).message };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Top level must be a JSON object with 'stations' and 'flows'." };
  }
  const o = raw as Record<string, unknown>;

  // A file written by a newer build can carry fields and invariants this
  // version does not understand. migrate() only ever walks the version number
  // upward, so a future schemaVersion would be normalized against today's rules
  // and load looking valid. Refuse it rather than silently mis-reading it.
  if (typeof o.schemaVersion === "number" && o.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Saved by a newer version (schema ${o.schemaVersion}); this build reads up to schema ${SCHEMA_VERSION}. Update the app to open it.`,
    };
  }

  if (!Array.isArray(o.stations)) return { ok: false, error: "'stations' array is missing." };
  if (!Array.isArray(o.flows)) return { ok: false, error: "'flows' array is missing." };
  const badStation = (o.stations as unknown[]).find(
    (s) => !s || typeof s !== "object" || typeof (s as { id?: unknown }).id !== "string",
  );
  if (badStation) return { ok: false, error: "Every station needs a string 'id'." };

  // Referential integrity. A duplicate id makes two stations indistinguishable
  // to every flow and to the rating; a flow pointing at an id no station
  // carries leaves a broken graph that still scores (grade A on nothing). Both
  // used to import silently — name the offender instead.
  const ids = (o.stations as Array<{ id: string }>).map((s) => s.id);
  const idSet = new Set<string>();
  for (const id of ids) {
    if (idSet.has(id)) {
      return { ok: false, error: `Duplicate station id '${id}'. Every station needs a unique id.` };
    }
    idSet.add(id);
  }

  const badFlow = (o.flows as unknown[]).find(
    (f) =>
      !f ||
      typeof f !== "object" ||
      typeof (f as { from?: unknown }).from !== "string" ||
      typeof (f as { to?: unknown }).to !== "string",
  );
  if (badFlow) return { ok: false, error: "Every flow needs string 'from' and 'to' ids." };

  const dangling = (o.flows as Array<{ from: string; to: string }>).find(
    (f) => !idSet.has(f.from) || !idSet.has(f.to),
  );
  if (dangling) {
    const missing = !idSet.has(dangling.from) ? dangling.from : dangling.to;
    return {
      ok: false,
      error: `Flow ${dangling.from} → ${dangling.to} points at '${missing}', which is not a station in this file.`,
    };
  }

  try {
    return { ok: true, model: migrate(raw) };
  } catch (e) {
    return { ok: false, error: "Could not load model: " + (e as Error).message };
  }
}

export function modelToJSON(model: Model): string {
  return JSON.stringify(model, null, 2);
}
