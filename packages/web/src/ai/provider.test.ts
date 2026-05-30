import { describe, it, expect } from "vitest";
import { strategist } from "@flowplan/core/ai/strategist";
import { getProvider } from "./provider";
import { DEFAULT_SETTINGS } from "../store/settings";

// The client-side provider selector: offline strategist unless a key is set,
// then a cloud provider that falls back to the strategist on failure.
describe("getProvider", () => {
  it("uses the offline strategist without a key", () => {
    expect(getProvider(DEFAULT_SETTINGS).name).toBe(strategist.name);
  });
  it("uses Claude when configured", () => {
    const p = getProvider({ ...DEFAULT_SETTINGS, aiProvider: "claude", keys: { claude: "k", openai: "" } });
    expect(p.name).toContain("Claude");
  });
  it("uses OpenAI when configured", () => {
    const p = getProvider({ ...DEFAULT_SETTINGS, aiProvider: "openai", keys: { claude: "", openai: "k" } });
    expect(p.name).toContain("OpenAI");
  });
});
