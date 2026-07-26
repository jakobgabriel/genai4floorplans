import type { VariantMode } from "../model/types";
import type { ProcessStep } from "./generate";

/**
 * The part portfolio — what the cell actually has to make.
 *
 * The planner used to ask for one product name, one annual volume and one list
 * of process steps. Real cells are not like that: they carry a handful of part
 * numbers, each with its own routing, each ramping on its own curve over the
 * program. Sizing against a single averaged number gets the station count wrong
 * in both directions — too few for the peak year, too many for the tail.
 *
 * So the portfolio is the input, and everything the generator needs is derived
 * from it:
 *
 *   sizing volume    the peak year's total, because the cell has to survive it
 *   program volume   every part, every year — the denominator for capex/part
 *   union routing    a station for every step any part needs
 *   mix modes        one per distinct routing, skipping the steps it does not use
 *
 * The mode collapse is the model's existing rule, applied to real data rather
 * than to hand-entered percentages: parts whose work content is identical are
 * one mode, however many part numbers they are.
 */

export interface Part {
  id: string;
  /** The part number as the plant knows it. */
  partNumber: string;
  /** This part's routing. Empty ⇒ the part is ignored. */
  steps: ProcessStep[];
  /** Good parts required per program year, index 0 = year 1. */
  demandByYear: number[];
}

export interface PortfolioDerivation {
  /** Program length, from the longest demand curve given. */
  years: number;
  /** Total good parts required in each year. */
  totalByYear: number[];
  /** 1-based. The year the cell has to be sized for. */
  peakYear: number;
  /** The peak year's total — the volume the cell is sized against. */
  peakVolume: number;
  /** Every part, every year. The denominator for capex per part. */
  programVolume: number;
  /** Union of every part's routing, in first-seen order. */
  steps: ProcessStep[];
  /** One per distinct routing. Shares are of the peak year. */
  modes: VariantMode[];
  /** partNumber → modeId, so the UI can show which parts collapsed together. */
  modeOfPart: Record<string, string>;
  /** Part numbers that were dropped for having no steps or no demand. */
  ignored: string[];
}

const key = (name: string) => name.trim().toLowerCase();

/** Demand in a given year, treating a short curve as zero thereafter. */
function inYear(p: Part, y: number): number {
  const v = p.demandByYear[y];
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Derive the generator's inputs from the parts.
 *
 * Returns null when the portfolio says nothing useful — no parts, or none with
 * both a routing and demand — so callers can fall back to the single-product
 * path rather than being handed a zeroed portfolio.
 */
export function derivePortfolio(parts: Part[]): PortfolioDerivation | null {
  const ignored = parts
    .filter((p) => p.steps.length === 0 || p.demandByYear.every((v) => !(v > 0)))
    .map((p) => p.partNumber);
  const live = parts.filter((p) => p.steps.length > 0 && p.demandByYear.some((v) => v > 0));
  if (live.length === 0) return null;

  const years = Math.max(1, ...live.map((p) => p.demandByYear.length));
  const totalByYear = Array.from({ length: years }, (_, y) => live.reduce((a, p) => a + inYear(p, y), 0));

  // The cell has to survive its busiest year, so that is what it is sized for.
  let peakYear = 1;
  for (let y = 1; y < years; y++) if (totalByYear[y] > totalByYear[peakYear - 1]) peakYear = y + 1;
  const peakVolume = totalByYear[peakYear - 1] ?? 0;
  const programVolume = totalByYear.reduce((a, b) => a + b, 0);

  // Union routing: a station for every step any part needs. First-seen order,
  // which is also the order `inferWorkload` assigns element ids in — the mode
  // overrides below are keyed on that.
  const steps: ProcessStep[] = [];
  const index = new Map<string, number>();
  for (const p of live) {
    for (const st of p.steps) {
      const k = key(st.name);
      if (!k || index.has(k)) continue;
      index.set(k, steps.length);
      steps.push({ ...st });
    }
  }

  // A part's override vector against the union: 0 for a step it skips, and the
  // ratio of its own cycle to the union's where the same step takes it longer.
  const vectorOf = (p: Part): number[] => {
    const v = steps.map(() => 0);
    for (const st of p.steps) {
      const i = index.get(key(st.name));
      if (i == null) continue;
      const base = steps[i].cycleTimeSec;
      const mine = st.cycleTimeSec;
      v[i] = base != null && base > 0 && mine != null && mine > 0 ? +(mine / base).toFixed(3) : 1;
    }
    return v;
  };

  // Parts with the same work content are one mode, however many part numbers.
  const groups = new Map<string, { vector: number[]; parts: Part[] }>();
  for (const p of live) {
    const vector = vectorOf(p);
    const sig = vector.join(",");
    const g = groups.get(sig);
    if (g) g.parts.push(p);
    else groups.set(sig, { vector, parts: [p] });
  }

  const modes: VariantMode[] = [];
  const modeOfPart: Record<string, string> = {};
  let n = 0;
  for (const { vector, parts: members } of groups.values()) {
    n += 1;
    const id = "mix-" + n;
    const volume = members.reduce((a, p) => a + inYear(p, peakYear - 1), 0);
    const elementOverrides: Record<string, number> = {};
    // `inferWorkload` numbers elements we1..weN by position in `steps`.
    vector.forEach((f, i) => {
      if (f !== 1) elementOverrides["we" + (i + 1)] = f;
    });
    modes.push({
      id,
      name: members.map((p) => p.partNumber).join(", "),
      share: peakVolume > 0 ? +(volume / peakVolume).toFixed(4) : 0,
      elementOverrides,
    });
    for (const p of members) modeOfPart[p.partNumber] = id;
  }

  return { years, totalByYear, peakYear, peakVolume, programVolume, steps, modes, modeOfPart, ignored };
}
