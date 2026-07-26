import { getSession, getHydratedPreferences } from "./session";
import { savePreferences } from "./apiClient";

// Per-user UI/app preferences. Persisted in Postgres via /api/me/preferences when
// signed in, mirrored to localStorage as a first-paint cache (and the sole store
// when offline). Reads are synchronous (the UI initialises state from them at
// mount); writes update the in-memory blob, mirror to localStorage immediately,
// and debounce a PUT to the API.

export interface Preferences {
  /** Carbon theme choice. */
  theme?: "g100" | "white";
  /** Editor panel layout. */
  panels?: {
    configW?: number;
    libW?: number;
    configCollapsed?: boolean;
    libCollapsed?: boolean;
  };
}

const LS_KEY = "flowplan_prefs";

let cache: Preferences | null = null;

function load(): Preferences {
  if (cache) return cache;
  const hydrated = getHydratedPreferences();
  if (hydrated) {
    cache = hydrated;
    return cache;
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    cache = raw ? (JSON.parse(raw) as Preferences) : {};
  } catch {
    cache = {};
  }
  return cache;
}

let timer: ReturnType<typeof setTimeout> | undefined;
function persist(): void {
  // Instant first-paint cache for the next load, even when signed in.
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  } catch {
    /* quota / disabled — non-fatal */
  }
  if (getSession()) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      savePreferences((cache ?? {}) as Record<string, unknown>).catch((err) => console.warn("preferences save failed", err));
    }, 500);
  }
}

/** A shallow copy of the current preferences. */
export function getPreferences(): Preferences {
  return { ...load() };
}

/** Merge a patch into the preferences and persist. `panels` merges one level
 *  deep so a single panel field can be updated without dropping the others. */
export function patchPreferences(patch: Preferences): void {
  const cur = load();
  cache = {
    ...cur,
    ...patch,
    ...(patch.panels ? { panels: { ...cur.panels, ...patch.panels } } : {}),
  };
  persist();
}
