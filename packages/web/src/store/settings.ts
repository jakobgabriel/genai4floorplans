// App settings (separate from the model): which AI provider to use and the
// optional per-provider API keys. Stored in localStorage only — never exported
// with the model, never sent anywhere except directly to the chosen provider.
//
// The Settings/Creds *types* + resolveCreds are pure and shared from
// @flowplan/core/ai/creds (so the server proxy can reuse them); this module owns
// only the browser-side localStorage load/save.

import { type AiProviderId, type Creds, type Settings, resolveCreds } from "@flowplan/core/ai/creds";

export type { AiProviderId, Creds, Settings };
export { resolveCreds };

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
