import type { AutoState, CycleKey, ErgoRisk, StationType } from "@flowplan/core/model/types";

export const TEAL = "#2bb6a8";
export const TEALD = "#1c6f68";
export const AMBER = "#e0a458";
export const RED = "#d96b5b";
export const TEXT = "#dde8e8";
export const TEXTD = "#7e9698";
export const LINE = "#24383d";
export const PANEL2 = "#19262a";

export const TYPE_COL: Record<StationType, string> = {
  machine: "#16343a",
  manual: "#2a2f1e",
  quality: "#1e2a36",
  store: "#2a2320",
  buffer: "#241e2a",
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
