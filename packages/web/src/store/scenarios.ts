import type { Model } from "@flowplan/core/model/types";
import { migrate } from "@flowplan/core/model/migrate";

// Persistence: a debounced autosave of the working model plus a set of named
// scenarios (variants) so a planner can compare ≥3 options per decision
// (spec success metric §8). All in localStorage — no backend in v1.

const AUTOSAVE_KEY = "flowplan_model";
const SCENARIOS_KEY = "flowplan_scenarios";

export interface ScenarioMeta {
  name: string;
  savedAt: number;
  folderId: string | null;
}

interface ScenarioStore {
  [name: string]: { model: Model; savedAt: number; folderId?: string | null };
}

function readScenarios(): ScenarioStore {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    return raw ? (JSON.parse(raw) as ScenarioStore) : {};
  } catch {
    return {};
  }
}

function writeScenarios(store: ScenarioStore): void {
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(store));
  } catch {
    /* quota / unavailable — ignore */
  }
}

export function loadAutosave(): Model | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && Array.isArray(o.stations) && Array.isArray(o.flows)) return migrate(o);
  } catch {
    /* ignore */
  }
  return null;
}

export function saveAutosave(model: Model): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(model));
  } catch {
    /* ignore */
  }
}

export function listScenarios(): ScenarioMeta[] {
  const store = readScenarios();
  return Object.keys(store)
    .map((name) => ({ name, savedAt: store[name].savedAt, folderId: store[name].folderId ?? null }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function saveScenario(name: string, model: Model): void {
  const store = readScenarios();
  // Preserve an existing scenario's folder when re-saving over it.
  store[name] = { model: { ...model, name }, savedAt: Date.now(), folderId: store[name]?.folderId ?? null };
  writeScenarios(store);
}

export function moveScenario(name: string, folderId: string | null): void {
  const store = readScenarios();
  if (store[name]) {
    store[name] = { ...store[name], folderId };
    writeScenarios(store);
  }
}

export function loadScenario(name: string): Model | null {
  const store = readScenarios();
  const entry = store[name];
  return entry ? migrate(entry.model) : null;
}

export function deleteScenario(name: string): void {
  const store = readScenarios();
  delete store[name];
  writeScenarios(store);
}
