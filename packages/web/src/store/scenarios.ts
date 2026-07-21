import type { Model } from "@flowplan/core/model/types";
import { migrate } from "@flowplan/core/model/migrate";
import { getProvider, getHydratedScenarios } from "./session";
import type { StorageProvider } from "./storage/StorageProvider";

// Named scenarios (variants) so a planner can compare ≥3 options per decision
// (spec success metric §8). Persisted in Postgres via the Scenario API when a
// DB session exists; otherwise (offline / unit tests) in localStorage.
//
// The public functions stay synchronous so the UI can read/list without
// plumbing async everywhere: reads come from an in-memory cache hydrated once at
// bootstrap; writes update that cache immediately and persist to the DB in the
// background. With no session they fall through to localStorage.

const SCENARIOS_KEY = "flowplan_scenarios";

export interface ScenarioMeta {
  name: string;
  savedAt: number;
  folderId: string | null;
}

export interface ScenarioStore {
  [name: string]: { model: Model; savedAt: number; folderId?: string | null };
}

// ---- localStorage (offline / no-session) --------------------------------
function readLocal(): ScenarioStore {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    return raw ? (JSON.parse(raw) as ScenarioStore) : {};
  } catch {
    return {};
  }
}

function writeLocal(store: ScenarioStore): void {
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(store));
  } catch {
    /* quota / unavailable — ignore */
  }
}

// ---- DB-backed cache (session) ------------------------------------------
// Lazily seeded from the bootstrap-hydrated store the first time it is read.
let cache: ScenarioStore | null = null;
function dbStore(): ScenarioStore {
  if (!cache) cache = getHydratedScenarios() ?? {};
  return cache;
}

/** Fetch every scenario (metadata + model) for the workspace so the sync reads
 *  can serve them from memory. Called by the bootstrap; the result is stored on
 *  the session and picked up by dbStore(). Scenarios are few per decision, so
 *  loading their models up front is cheap. */
export async function hydrateScenarios(provider: StorageProvider): Promise<ScenarioStore> {
  const metas = await provider.listScenarios();
  const store: ScenarioStore = {};
  await Promise.all(
    metas.map(async (m) => {
      const model = await provider.loadScenario(m.name);
      if (model) store[m.name] = { model, savedAt: m.savedAt, folderId: m.folderId };
    }),
  );
  cache = store;
  return store;
}

/** The store backing reads/writes right now: the DB cache when signed in, else
 *  localStorage. */
function activeStore(): ScenarioStore {
  return getProvider() ? dbStore() : readLocal();
}

export function listScenarios(): ScenarioMeta[] {
  const store = activeStore();
  return Object.keys(store)
    .map((name) => ({ name, savedAt: store[name].savedAt, folderId: store[name].folderId ?? null }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function loadScenario(name: string): Model | null {
  const entry = activeStore()[name];
  return entry ? migrate(entry.model) : null;
}

export function saveScenario(name: string, model: Model): void {
  const provider = getProvider();
  const m = { ...model, name };
  if (provider) {
    const store = dbStore();
    store[name] = { model: m, savedAt: Date.now(), folderId: store[name]?.folderId ?? null };
    provider.saveScenario(name, m).catch((err) => console.warn("scenario save failed", err));
  } else {
    const store = readLocal();
    store[name] = { model: m, savedAt: Date.now(), folderId: store[name]?.folderId ?? null };
    writeLocal(store);
  }
}

export function moveScenario(name: string, folderId: string | null): void {
  const provider = getProvider();
  if (provider) {
    const store = dbStore();
    if (store[name]) store[name] = { ...store[name], folderId };
    provider.moveScenario(name, folderId).catch((err) => console.warn("scenario move failed", err));
  } else {
    const store = readLocal();
    if (store[name]) {
      store[name] = { ...store[name], folderId };
      writeLocal(store);
    }
  }
}

export function deleteScenario(name: string): void {
  const provider = getProvider();
  if (provider) {
    delete dbStore()[name];
    provider.deleteScenario(name).catch((err) => console.warn("scenario delete failed", err));
  } else {
    const store = readLocal();
    delete store[name];
    writeLocal(store);
  }
}
