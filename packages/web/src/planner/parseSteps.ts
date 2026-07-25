import type { ProcessStep } from "@flowplan/core/engine/generate";

/**
 * Parse pasted step lines. Accepts "Name<tab>25", "Name, 25", "Name; 25",
 * "Name 25", or a bare "Name" (defaulting the cycle) — industrial engineers
 * paste from Excel, and the separator is whatever their sheet used.
 */
export function parseSteps(text: string, defaultCycle?: number): ProcessStep[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)[\t,;]?\s*(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs)?$/i);
      if (m && m[1].trim()) {
        return { name: m[1].trim().replace(/[\t,;]+$/, ""), cycleTimeSec: Math.max(0.1, parseFloat(m[2].replace(",", "."))) };
      }
      // No number given: leave it undefined so inference supplies a
      // capability-appropriate default rather than one blanket value.
      return { name: line.replace(/[\t,;]+$/, ""), cycleTimeSec: defaultCycle };
    });
}

/**
 * Parse one part's routing written on a single line.
 *
 * A part table cannot give every routing its own textarea, so a routing is one
 * field: steps separated by an arrow or a comma, each optionally carrying its
 * cycle time. `Load 5 > Press 10 > Weld 20`, `Load, Press, Weld`, and
 * `Load:5 → Press:10` all parse. A step with no time is left undefined so
 * inference supplies one appropriate to the matched capability.
 */
export function parseRouting(text: string): ProcessStep[] {
  return text
    .split(/[>→›]|,(?![^()]*\))|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = chunk.match(/^(.*?)[:\s]\s*(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs)?$/i);
      if (m && m[1].trim()) {
        return { name: m[1].trim(), cycleTimeSec: Math.max(0.1, parseFloat(m[2].replace(",", "."))) };
      }
      return { name: chunk };
    });
}

/** Render a routing back into the one-line form, for editing. */
export function formatRouting(steps: ProcessStep[]): string {
  return steps.map((s) => (s.cycleTimeSec != null ? `${s.name} ${s.cycleTimeSec}` : s.name)).join(" > ");
}
