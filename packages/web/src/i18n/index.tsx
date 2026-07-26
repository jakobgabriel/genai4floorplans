import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { de } from "./de";

// A small, dependency-free i18n layer.
//
// Strings live in per-language dictionaries keyed by a dotted id. `t(key)`
// resolves against the active language, falls back to English, then to the key
// itself — so a missing translation degrades to readable English rather than a
// blank, and an unknown key is visible in development rather than silent. Simple
// {name} placeholders interpolate from a vars object.
//
// This is deliberately not a full ICU/plural engine: the app's copy is short and
// declarative, and the goal here is a working language switch with a structure
// the rest of the strings can be moved into incrementally.

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
] as const;
export type Lang = (typeof LANGUAGES)[number]["id"];

const DICTS: Record<Lang, Record<string, string>> = { en, de };
const KEY = "flowplan_lang";

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "de") return v;
    const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    if (nav === "de") return "de";
  } catch {
    /* ignore */
  }
  return "en";
}

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFunc;
}
// A working English default, so a component used outside the provider (a unit
// test, a stray render) still shows readable text rather than throwing.
const DEFAULT: I18nCtx = { lang: "en", setLang: () => {}, t: (key, vars) => interpolate(en[key] ?? key, vars) };
const Ctx = createContext<I18nCtx>(DEFAULT);

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => loadLang());
  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);
  const t = useCallback<TFunc>(
    (key, vars) => interpolate(DICTS[lang][key] ?? en[key] ?? key, vars),
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  return useContext(Ctx);
}

/** The translate function on its own, for components that only need `t`. */
export function useT(): TFunc {
  return useI18n().t;
}
