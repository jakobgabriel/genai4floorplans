import { useMemo } from "react";
import type { AutoState, CycleKey, ErgoRisk, StationType } from "@flowplan/core/model/types";
import { useTheme, type ThemeName } from "../store/theme";

/**
 * Colour, in one place — now theme-aware.
 *
 * This file used to export a single frozen palette, captured once at module
 * load from the CSS variables on `:root`. That worked while the app was dark
 * only: every accent was read once and never changed. With a light theme it
 * broke, and in a way the CSS could not fix on its own:
 *
 *   - Carbon emits its dark (g100) `--cds-*` tokens on `:root` and only
 *     overrides them on the `.cds--white` class we put on `<body>`. Reading a
 *     variable off `document.documentElement` therefore always returned the
 *     dark value, whatever the theme.
 *   - The canvas paints with SVG *presentation attributes* (`fill={TEAL}`),
 *     which take a resolved colour string, not `var(--data-teal)` — so a CSS
 *     override could never reach them anyway.
 *
 * So the palette lives here, keyed by theme, and is read at render time through
 * `useAccents()`. The whole tree re-renders when the theme changes (the theme
 * state sits above <App/>), so every canvas and chart repaints with the right
 * set. `readAccents()` is the non-React entry point for the image exporter.
 *
 * Two kinds of colour, and the distinction is still the point:
 *   Status — good / warning / bad. An ordered scale (teal → amber → red).
 *   Data   — station type, waste class, ergonomic risk. Categorical, not
 *            ordered, so Carbon's status palette cannot express it.
 *
 * The light values mirror the `--data-*` overrides in tokens.css so that the
 * parts painted by CSS (chips, swatches) and the parts painted here (canvas,
 * charts) agree. Light accents are darkened to hold WCAG AA (≥4.5:1 text,
 * ≥3:1 graphics) on a white surface; light station fills are pale tints so the
 * dark station label text stays legible on them.
 */

export interface Accents {
  TEAL: string;
  TEALD: string;
  AMBER: string;
  RED: string;
  TEXT: string;
  TEXTD: string;
  LINE: string;
  PANEL2: string;
  BLUE: string;
  PURPLE: string;
  /** Station fills by type (categorical). */
  TYPE_COL: Record<StationType, string>;
  /** Station fill when its footprint overlaps another or a no-go zone. */
  COLLIDE_COL: string;
  /** No-go zone fill. */
  NOGO_COL: string;
  /** Exported-image backdrop; matches the canvas surface at export time. */
  EXPORT_BG: string;
  /** Hairline behind a port dot so it reads against any station fill. */
  PORT_RING: string;
  /** 0–100 quality score → status colour. The one ordered scale. */
  scoreColor: (score: number) => string;
  /** Cycle-time classes; value-add is the only teal band. */
  CYCLE_COL: Record<CycleKey, string>;
  ERGO_COL: Record<ErgoRisk, string>;
  AUTO_COL: Record<AutoState, string>;
}

/** The raw, theme-specific values everything else is derived from. */
interface Palette {
  teal: string;
  tealDim: string;
  amber: string;
  red: string;
  blue: string;
  purple: string;
  text: string;
  textMuted: string;
  line: string;
  panel: string;
  station: Record<StationType, string>;
  collide: string;
  nogo: string;
  exportBg: string;
  portRing: string;
}

const PALETTES: Record<ThemeName, Palette> = {
  // Dark (g100). The values that shipped as the single frozen palette.
  dark: {
    teal: "#3ddbd9",
    tealDim: "#007d79",
    amber: "#d2a106",
    red: "#fa4d56",
    blue: "#6f9bd1",
    purple: "#a582c9",
    text: "#f4f4f4",
    textMuted: "#c6c6c6",
    line: "#393939",
    panel: "#262626",
    station: {
      machine: "#16343a",
      manual: "#2a2f1e",
      quality: "#1e2a36",
      store: "#2a2320",
      buffer: "#241e2a",
    },
    collide: "#3a1f1c",
    nogo: "#1a1205",
    exportBg: "#141d20",
    portRing: "#0e1416",
  },
  // Light (white). Accents darkened for AA on white; station fills are pale
  // tints of the same hue so the dark station label text stays legible.
  light: {
    teal: "#0f766e",
    tealDim: "#115e59",
    amber: "#8a5a00",
    red: "#b42318",
    blue: "#3b5f8a",
    purple: "#6b4c8a",
    text: "#161616",
    textMuted: "#525252",
    line: "#c6c6c6",
    panel: "#e8e8e8",
    station: {
      machine: "#cfe6e4",
      manual: "#e5e8cd",
      quality: "#d4e2f2",
      store: "#f0e4d0",
      buffer: "#e7ddf2",
    },
    collide: "#f7d7d2",
    nogo: "#f3ead0",
    exportBg: "#ffffff",
    portRing: "#ffffff",
  },
};

function build(p: Palette): Accents {
  const scoreColor = (score: number): string => (score >= 80 ? p.teal : score >= 60 ? p.amber : p.red);
  return {
    TEAL: p.teal,
    TEALD: p.tealDim,
    AMBER: p.amber,
    RED: p.red,
    TEXT: p.text,
    TEXTD: p.textMuted,
    LINE: p.line,
    PANEL2: p.panel,
    BLUE: p.blue,
    PURPLE: p.purple,
    TYPE_COL: p.station,
    COLLIDE_COL: p.collide,
    NOGO_COL: p.nogo,
    EXPORT_BG: p.exportBg,
    PORT_RING: p.portRing,
    scoreColor,
    ERGO_COL: { low: p.teal, med: p.amber, high: p.red },
    AUTO_COL: { manual: p.red, semi: p.amber, auto: p.teal },
    // Value-add is the only teal band — the four waste classes read as
    // warm/cool "not teal" so a glance at a Yamazumi bar shows the ratio.
    CYCLE_COL: {
      valueAddSec: p.teal,
      handlingSec: p.amber,
      walkSec: p.blue,
      waitSec: p.red,
      setupSec: p.purple,
    },
  };
}

const BUILT: Record<ThemeName, Accents> = { dark: build(PALETTES.dark), light: build(PALETTES.light) };

/** React hook: the accent set for the active theme. Recomputes on theme change;
 *  the reference is stable within a theme so it is safe in effect deps. */
export function useAccents(): Accents {
  const { theme } = useTheme();
  return useMemo(() => BUILT[theme], [theme]);
}

/** Non-React accessor for imperative code (the image exporter). Reads the theme
 *  from the class the ThemeProvider puts on <body>, falling back to dark. */
export function readAccents(): Accents {
  if (typeof document !== "undefined" && document.body.classList.contains("cds--white")) return BUILT.light;
  return BUILT.dark;
}
