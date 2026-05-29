import type { Station } from "../model/types";
import { DEFAULT_SHIFT_HOURS } from "../model/types";

export interface BalanceStep {
  id: string;
  name: string;
  rate: number;
  cycle: number;
  util: number;
}

export interface BalanceResult {
  steps: BalanceStep[];
  bottleneck: BalanceStep | null;
  lineOut: number;
  maxRate: number;
  score: number;
  takt: number;
}

function shiftSeconds(hours: number): number {
  return hours * 3600;
}

// Effective parts/shift a process step can output, given its per-station shift
// length (Phase 2; defaults to the model/global shift, then 8h). operators ~
// parallelism for manual steps (a simplification, per spec §9).
export function stationRate(s: Station, shiftHours: number = DEFAULT_SHIFT_HOURS): number {
  const hours = s.shiftHours ?? shiftHours;
  const byCycle =
    s.cycleTimeSec > 0
      ? Math.floor((3600 / s.cycleTimeSec) * hours * Math.max(1, s.operators))
      : Infinity;
  const cap = s.capacityPerShift > 0 ? s.capacityPerShift : Infinity;
  const r = Math.min(byCycle, cap);
  return isFinite(r) ? r : cap === Infinity ? byCycle : cap;
}

// Actionable, bottleneck-aware suggestions (spec v1.1) — recommends lifting the
// constraint rather than just moving boxes. Returns ordered, plain-language tips.
export function bottleneckAdvice(bal: BalanceResult, stations: Station[]): string[] {
  const tips: string[] = [];
  const bn = bal.bottleneck;
  if (!bn) return tips;
  const st = stations.find((s) => s.id === bn.id);
  tips.push(
    `${bn.name} caps the line at ${bal.lineOut.toLocaleString()} parts/shift (takt ≈ ${bal.takt}s).`,
  );
  if (st && st.operators >= 1 && st.cycleTimeSec > 0) {
    const withOne = Math.round(bn.rate * ((st.operators + 1) / Math.max(1, st.operators)));
    tips.push(
      `Parallelize: adding one operator/station could lift it to ~${withOne.toLocaleString()}/shift (if the work splits).`,
    );
  }
  if (st && st.changeoverMin > 30) {
    tips.push(`Reduce changeover (${st.changeoverMin} min) with SMED — it eats into available run time.`);
  }
  if (st && st.cycleTimeSec > 0) {
    tips.push(`Shorten cycle time (${st.cycleTimeSec}s) via tooling/automation to raise the ceiling.`);
  }
  const secondSlowest = bal.steps
    .filter((s) => s.id !== bn.id && s.rate > 0)
    .sort((a, b) => a.rate - b.rate)[0];
  if (secondSlowest) {
    tips.push(
      `Headroom: the next-slowest step (${secondSlowest.name}) runs at ${secondSlowest.rate.toLocaleString()}/shift — the realistic target after fixing the constraint.`,
    );
  }
  return tips;
}

export function balanceAnalysis(
  stations: Station[],
  shiftHours: number = DEFAULT_SHIFT_HOURS,
): BalanceResult {
  const proc = stations.filter((s) => s.role === "process");
  if (proc.length === 0) {
    return { steps: [], bottleneck: null, lineOut: 0, maxRate: 0, score: 100, takt: 0 };
  }
  const steps: BalanceStep[] = proc.map((s) => {
    const rate = stationRate(s, shiftHours);
    return { id: s.id, name: s.name, rate: isFinite(rate) ? rate : 0, cycle: s.cycleTimeSec, util: 0 };
  });
  const finite = steps.filter((x) => x.rate > 0);
  const lineOut = finite.length ? Math.min(...finite.map((x) => x.rate)) : 0;
  const maxRate = finite.length ? Math.max(...finite.map((x) => x.rate)) : 0;
  steps.forEach((x) => {
    x.util = x.rate > 0 ? Math.round((lineOut / x.rate) * 100) : 0;
  });
  let bottleneck: BalanceStep | null = null;
  steps.forEach((x) => {
    if (x.rate === lineOut && x.rate > 0 && !bottleneck) bottleneck = x;
  });
  const mean = finite.length ? finite.reduce((a, x) => a + x.rate, 0) / finite.length : 0;
  const score = mean > 0 ? Math.max(0, Math.min(100, (lineOut / mean) * 100)) : 100;
  // Use the bottleneck's shift to express takt (sec/part across the shift).
  const bnHours =
    (bottleneck && proc.find((p) => p.id === (bottleneck as BalanceStep).id)?.shiftHours) ?? shiftHours;
  const takt = lineOut > 0 ? +(shiftSeconds(bnHours) / lineOut).toFixed(1) : 0;
  return { steps, bottleneck, lineOut, maxRate, score: Math.round(score), takt };
}
