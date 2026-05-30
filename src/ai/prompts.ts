// Shared LLM prompts + JSON extraction, used by every cloud adapter (Claude,
// OpenAI, …). Keeping these in one place means a new provider is just a transport
// shim — the instructions and parsing stay identical, so output is post-processed
// (and re-scored by the engine) the same way regardless of provider.

import type { Model } from "../model/types";

export const SYSTEM = `You are FlowPlan's layout strategist for a single manufacturing cell.
You receive a JSON "model" (stations on a grid, with flows between them) and must
respond ONLY with JSON — no prose, no code fences. Stations have x,y,w,h on a
gridW×gridH grid; "fixed" stations must not move; never overlap stations or
noGoZones. You never invent KPI numbers; the host app scores your output.`;

export function proposePrompt(model: Model): string {
  return `Here is the current cell model:\n${JSON.stringify(
    model,
  )}\n\nPropose up to 4 improved layouts. Respond with JSON: an array of objects {"title": string, "rationale": string, "model": <full model JSON>}. Keep ids, footprints and fixed flags; only reposition movable stations and optionally change flow transport.`;
}

export function narratePrompt(model: Model, rating: unknown): string {
  return `Cell model:\n${JSON.stringify(
    model,
  )}\n\nEngine rating (authoritative, do not change the numbers):\n${JSON.stringify(
    rating,
  )}\n\nWrite a concise plain-language paragraph for a review pack explaining the grade, the binding constraint, and the top 1-2 trade-offs. Respond with JSON {"narration": string}.`;
}

export function editPrompt(model: Model, instruction: string): string {
  return `Cell model:\n${JSON.stringify(model)}\n\nUser instruction: ${JSON.stringify(
    instruction,
  )}\n\nReturn JSON {"summary": string, "actions": ModelAction[]} where ModelAction is one of: {"type":"MOVE_STATION","id","x","y"}, {"type":"ADD_FLOW","from","to"}, {"type":"REMOVE_FLOW","from","to"}, {"type":"UPDATE_STATION","id","patch":{}}, {"type":"APPLY_TEMPLATE","form":"I|U|L|S"}, {"type":"DELETE_STATION","id"}. Use existing station ids.`;
}

export function ingestPrompt(text: string): string {
  return `Convert this routing sheet / description into a FlowPlan model. Respond with JSON for the model only (fields: name, gridW, gridH, stations[], flows[]). Routing:\n${text}`;
}

export function designPrompt(brief: string): string {
  return `Design a single manufacturing cell from this brief. Respond with model JSON only (name, gridW, gridH, stations[] with id/name/role(input|process|output)/type/cycleTimeSec/operators/parallelUnits, flows[] with from/to/volume). Brief:\n${brief}`;
}

export const VISION_TEXT =
  "This is a routing sheet or a hand-drawn cell layout. Extract a FlowPlan model. Respond with model JSON only (name, gridW, gridH, stations[], flows[]).";

/** Tolerant JSON extraction: strip code fences, then fall back to bracket slicing. */
export function extractJSON(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const arr = cleaned.indexOf("[");
    const from = arr >= 0 && (arr < start || start < 0) ? arr : start;
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (from >= 0 && end > from) return JSON.parse(cleaned.slice(from, end + 1));
    throw new Error("The model did not return JSON.");
  }
}
