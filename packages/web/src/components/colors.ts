// Canonical source of truth for the app's chromatic data-encoding palette.
// The SVG canvas and charts import these hexes directly; the CSS mirror in
// styles/tokens.css (--teal/--tealDim/--amber/--red) must match verbatim.
import type { AutoState, CycleKey, ErgoRisk, StationType, ZoneKind } from "@flowplan/core/model/types";

// Data-encoding hues — meaningful regardless of theme, kept as fixed chroma.
export const TEAL = "#2bb6a8";
export const TEALD = "#1c6f68";
export const AMBER = "#e0a458";
export const RED = "#d96b5b";

// Theme-sensitive chrome — routed to Carbon tokens so both the SVG canvas
// (fill/stroke) and inline styles (color/border) re-theme automatically between
// the dark (g100) and light (white) themes. Never concatenate a hex alpha onto
// these; use a token or rgba() instead.
export const TEXT = "var(--cds-text-primary)";
export const TEXTD = "var(--cds-text-secondary)";
export const LINE = "var(--cds-border-subtle-01)";
export const PANEL2 = "var(--cds-layer-02)";

// Station fills by type. Values live in tokens.css as `--type-*` with a dark and
// a light ramp, so a station box is legible on both themes (see tokens.css).
export const TYPE_COL: Record<StationType, string> = {
  machine: "var(--type-machine)",
  manual: "var(--type-manual)",
  quality: "var(--type-quality)",
  store: "var(--type-store)",
  buffer: "var(--type-buffer)",
};
export const ERGO_COL: Record<ErgoRisk, string> = { low: TEAL, med: AMBER, high: RED };
export const AUTO_COL: Record<AutoState, string> = { manual: RED, semi: AMBER, auto: TEAL };

export function scoreColor(score: number): string {
  return score >= 80 ? TEAL : score >= 60 ? AMBER : RED;
}

// Cycle-time classes. Value-add is the only teal band — the four waste classes
// read as warm/cool "not teal" so a glance at a Yamazumi bar shows the ratio.
export const BLUE = "#6f9bd1";
export const PURPLE = "#a582c9";
export const CYCLE_COL: Record<CycleKey, string> = {
  valueAddSec: TEAL,
  handlingSec: AMBER,
  walkSec: BLUE,
  waitSec: RED,
  setupSec: PURPLE,
};

// Non-station zone kinds. Obstacles read red/grey (design around them); reserved
// space reads cool and dashed (planned, not blocked).
const GREY = "#5a6b6e";
export const ZONE_STYLE: Record<ZoneKind, { stroke: string; fill: string; dash?: string; label: string }> = {
  blocking: { stroke: RED, fill: RED, dash: "4 3", label: "Blocking area" },
  wall: { stroke: GREY, fill: GREY, label: "Wall" },
  column: { stroke: GREY, fill: GREY, label: "Column" },
  spacer: { stroke: TEAL, fill: TEAL, dash: "2 4", label: "Spacer" },
  aisle: { stroke: BLUE, fill: BLUE, dash: "6 4", label: "Aisle" },
  esd: { stroke: PURPLE, fill: PURPLE, dash: "2 3", label: "ESD zone" },
};
