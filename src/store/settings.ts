// App settings (separate from the model): which AI provider to use and the
// optional per-provider API keys. Stored in localStorage only — never exported
// with the model, never sent anywhere except directly to the chosen provider.

export type AiProviderId = "offline" | "claude" | "openai";

/** A provider's resolved credentials: the active key + model id. */
export interface Creds {
  apiKey: string;
  model: string;
}

export interface Settings {
  aiProvider: AiProviderId;
  // Each provider remembers its own key + model so switching never wipes the other.
  keys: { claude: string; openai: string };
  models: { claude: string; openai: string };
}

const KEY = "flowplan_settings";

export const DEFAULT_SETTINGS: Settings = {
  aiProvider: "offline",
  keys: { claude: "", openai: "" },
  models: { claude: "claude-sonnet-4-6", openai: "gpt-4o" },
};

// Legacy v1 settings stored a single { apiKey, model } pair (Claude-only).
interface LegacySettings {
  apiKey?: string;
  model?: string;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings> & LegacySettings;
      const s: Settings = {
        aiProvider: parsed.aiProvider ?? DEFAULT_SETTINGS.aiProvider,
        keys: { ...DEFAULT_SETTINGS.keys, ...parsed.keys },
        models: { ...DEFAULT_SETTINGS.models, ...parsed.models },
      };
      // Migrate legacy single-key settings into the Claude slot.
      if (parsed.apiKey && !parsed.keys) s.keys.claude = parsed.apiKey;
      if (parsed.model && !parsed.models) s.models.claude = parsed.model;
      return s;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys }, models: { ...DEFAULT_SETTINGS.models } };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Resolve the active provider's key + model. Empty for the offline strategist. */
export function resolveCreds(s: Settings): Creds {
  if (s.aiProvider === "claude") return { apiKey: s.keys.claude, model: s.models.claude };
  if (s.aiProvider === "openai") return { apiKey: s.keys.openai, model: s.models.openai };
  return { apiKey: "", model: "" };
}
