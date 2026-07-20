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
