import { useEffect, useState } from "react";
import { getPreferences, patchPreferences } from "./preferences";

// App theme: dark (Carbon g100) ⇄ light (Carbon white). Every route must render
// inside a <Theme> with this value so the editor AND the workspace/library
// pages re-theme together. `data-theme` on the root drives the custom
// data-encoding fills Carbon doesn't own (tokens.css --type-*). Persisted in the
// user's preferences (Postgres when signed in, else localStorage).
export type CarbonTheme = "g100" | "white";

export function useTheme(): { theme: CarbonTheme; toggle: () => void } {
  const [theme, setTheme] = useState<CarbonTheme>(() => (getPreferences().theme === "white" ? "white" : "g100"));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme === "white" ? "light" : "dark");
    patchPreferences({ theme });
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "g100" ? "white" : "g100")) };
}
