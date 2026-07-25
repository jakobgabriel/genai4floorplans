import type { AutoState, CycleKey, ErgoRisk, StationType } from "@flowplan/core/model/types";

/**
 * Colour, in one place.
 *
 * This file used to carry a whole second palette — #2bb6a8 teal, #d96b5b red,
 * #e0a458 amber, #dde8e8 text, #7e9698 dim, #24383d line, #19262a panel —
 * shadowing tokens that already existed in `tokens.css`. Two greens that meant
 * "good", two reds that meant "bad", and no way to retheme either.
 *
 * There are now two kinds of colour and the distinction is the point:
 *
 *   Status  — good / warning / bad. Comes from the theme. Never hard-coded.
 *   Data    — station type, waste class, ergonomic risk. Categorical, not
 *             ordered, so Carbon's status palette cannot express it without
 *             implying that "walking" is worse than "waiting".
 */

/** Read a token so SVG attributes and canvas code get the themed value. */
const token = (name: string, fallback: string): string => {
  if (typeof window === "undefined" || !window.getComputedStyle) return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

// ---- status -----------------------------------------------------------------
// Names kept (they are used as SVG `fill`/`stroke` in ~40 places) but they now
// resolve to the theme's data tokens rather than to their own hexes.
export const TEAL = token("--data-teal", "#3ddbd9");
export const TEALD = token("--data-teal-dim", "#007d79");
export const AMBER = token("--data-amber", "#d2a106");
export const RED = token("--data-red", "#fa4d56");
export const TEXT = token("--text-primary", "#f4f4f4");
export const TEXTD = token("--text-muted", "#c6c6c6");
export const LINE = token("--border", "#393939");
export const PANEL2 = token("--surface-raised", "#262626");

/** 0–100 quality score → status colour. The one ordered scale. */
export function scoreColor(score: number): string {
  return score >= 80 ? TEAL : score >= 60 ? AMBER : RED;
}

export const ERGO_COL: Record<ErgoRisk, string> = { low: TEAL, med: AMBER, high: RED };
export const AUTO_COL: Record<AutoState, string> = { manual: RED, semi: AMBER, auto: TEAL };

// ---- categorical ------------------------------------------------------------

/** Station fills. Desaturated so the station's own status dots stay legible. */
export const TYPE_COL: Record<StationType, string> = {
  machine: "#16343a",
  manual: "#2a2f1e",
  quality: "#1e2a36",
  store: "#2a2320",
  buffer: "#241e2a",
};

/** Station fill when its footprint overlaps another or a no-go zone. */
export const COLLIDE_COL = "#3a1f1c";
/** No-go zone fill, and the darker stroke while one is being dragged out. */
export const NOGO_COL = "#1a1205";
/** Exported-image backdrop. Matches the canvas surface at export time. */
export const EXPORT_BG = "#141d20";
/** Hairline behind a port dot, so it reads against any station fill. */
export const PORT_RING = "#0e1416";

export const BLUE = "#6f9bd1";
export const PURPLE = "#a582c9";

/** Cycle-time classes. Value-add is the only teal band — the four waste classes
 *  read as warm/cool "not teal" so a glance at a Yamazumi bar shows the ratio. */
export const CYCLE_COL: Record<CycleKey, string> = {
  valueAddSec: TEAL,
  handlingSec: AMBER,
  walkSec: BLUE,
  waitSec: RED,
  setupSec: PURPLE,
};
