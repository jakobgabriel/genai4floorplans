import { useEffect, useState } from "react";

// App theme: dark (Carbon g100) ⇄ light (Carbon white). Every route must render
// inside a <Theme> with this value so the editor AND the workspace/library/site
// pages re-theme together. `data-theme` on the root drives the custom
// data-encoding fills Carbon doesn't own (tokens.css --type-*). Persisted.
export type CarbonTheme = "g100" | "white";

export function useTheme(): { theme: CarbonTheme; toggle: () => void } {
  const [theme, setTheme] = useState<CarbonTheme>(() => (localStorage.getItem("flowplan_theme") === "white" ? "white" : "g100"));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme === "white" ? "light" : "dark");
    localStorage.setItem("flowplan_theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "g100" ? "white" : "g100")) };
}
