// AI provider identity + resolved credentials. These are pure, isomorphic types
// (and one pure resolver) shared by the client selector and the server proxy.
// The browser-only load/save of Settings to localStorage lives in the web app.

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

/** Resolve the active provider's key + model. Empty for the offline strategist. */
export function resolveCreds(s: Settings): Creds {
  if (s.aiProvider === "claude") return { apiKey: s.keys.claude, model: s.models.claude };
  if (s.aiProvider === "openai") return { apiKey: s.keys.openai, model: s.models.openai };
  return { apiKey: "", model: "" };
}
