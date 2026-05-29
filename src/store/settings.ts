// App settings (separate from the model): which AI provider to use and the
// optional Claude API key. Stored in localStorage only — never exported with
// the model, never sent anywhere except directly to the chosen provider.

export type AiProviderId = "offline" | "claude";

export interface Settings {
  aiProvider: AiProviderId;
  apiKey: string;
  model: string;
}

const KEY = "flowplan_settings";

export const DEFAULT_SETTINGS: Settings = {
  aiProvider: "offline",
  apiKey: "",
  model: "claude-sonnet-4-6",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
