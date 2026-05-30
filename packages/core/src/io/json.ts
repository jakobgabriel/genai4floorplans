import type { Model } from "../model/types";
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
  if (!Array.isArray(o.stations)) return { ok: false, error: "'stations' array is missing." };
  if (!Array.isArray(o.flows)) return { ok: false, error: "'flows' array is missing." };
  const badStation = (o.stations as unknown[]).find(
    (s) => !s || typeof s !== "object" || typeof (s as { id?: unknown }).id !== "string",
  );
  if (badStation) return { ok: false, error: "Every station needs a string 'id'." };
  const badFlow = (o.flows as unknown[]).find(
    (f) =>
      !f ||
      typeof f !== "object" ||
      typeof (f as { from?: unknown }).from !== "string" ||
      typeof (f as { to?: unknown }).to !== "string",
  );
  if (badFlow) return { ok: false, error: "Every flow needs string 'from' and 'to' ids." };
  try {
    return { ok: true, model: migrate(raw) };
  } catch (e) {
    return { ok: false, error: "Could not load model: " + (e as Error).message };
  }
}

export function modelToJSON(model: Model): string {
  return JSON.stringify(model, null, 2);
}
