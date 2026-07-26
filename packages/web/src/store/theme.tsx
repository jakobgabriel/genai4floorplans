import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Light / dark theming.
//
// The whole app is token-driven (`--cds-*`), so a theme is really just which
// Carbon theme class sits on the document root: everything — Carbon components
// and the app's own CSS — resolves its colours from there. We keep the choice
// in localStorage and mirror it onto `document.body` so even the parts rendered
// outside the React tree (the print sheet, the scrollbars) pick it up.

export type ThemeName = "dark" | "light";

const KEY = "flowplan_theme";
/** Carbon theme token for each app theme. g100 is the established dark; white
 *  is the light counterpart (g10 would be a softer grey — white reads cleaner
 *  for a document-heavy tool). */
export const CARBON_THEME: Record<ThemeName, "g100" | "white"> = { dark: "g100", light: "white" };
const CLASSES = ["cds--white", "cds--g10", "cds--g90", "cds--g100"];

export function loadTheme(): ThemeName {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
    // Honour the OS preference on first visit, then remember the explicit choice.
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch {
    /* ignore */
  }
  return "dark";
}

/** Put the theme on the document root so plain CSS and Carbon both see it. */
export function applyTheme(t: ThemeName): void {
  const body = document.body;
  CLASSES.forEach((c) => body.classList.remove(c));
  body.classList.add("cds--" + CARBON_THEME[t]);
  document.documentElement.setAttribute("data-theme", t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#ffffff" : "#161616");
}

interface ThemeCtx {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggle: () => void;
}
const Ctx = createContext<ThemeCtx>({ theme: "dark", setTheme: () => {}, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() => loadTheme());
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}
