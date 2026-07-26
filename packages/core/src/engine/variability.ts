import type { Model, Station } from "../model/types";
import { isFlowFunction } from "../model/types";
import { effectiveCycleSec } from "./cycle";
import { customerTaktSec } from "./takt";

// Cycle-time variability (spec §13, audit C-09). Every other analysis treats a
// cycle time as a single number — its mean. But losses live in the tail: a
// station that averages 45s against a 50s takt still misses takt on the cycles
// where it runs 58s, and with no buffer that miss propagates to line output.
// F7 of the source: "the p95 tail — where losses live — is invisible."
//
// Given a mean μ and a coefficient of variation c (σ/μ), the cycle is modelled
// as LOGNORMAL — the standard for task/process times: strictly positive and
// right-skewed (a task can run long, never negative). The whole module is gated
// on a CV being present; absent (⇒ 0) the cycle is deterministic and nothing
// here fires, so mean-based numbers and the golden sample are untouched.

// Standard-normal quantiles for the reported percentiles.
const Z95 = 1.6448536;
const Z99 = 2.3263479;

/** erf via Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Standard-normal CDF Φ(x). */
function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Lognormal parameters (m, s) — mean/sd of ln X — for a target mean and CV. */
function logParams(mean: number, cv: number): { m: number; s: number } {
  const s = Math.sqrt(Math.log(1 + cv * cv));
  const m = Math.log(mean) - (s * s) / 2;
  return { m, s };
}

export interface CyclePercentiles {
  id: string;
  name: string;
  meanSec: number;
  cv: number;
  p50Sec: number;
  p95Sec: number;
  p99Sec: number;
  /** P(cycle ≤ takt), 0–1. null when there is no takt. */
  taktAttainment: number | null;
  /** Mean is under takt but p95 is over — meets demand on average, misses it in
   *  the tail. The fragile case the mean hides. */
  fragile: boolean;
}

export interface LineVariability {
  /** True when at least one process station carries a CV > 0. */
  hasData: boolean;
  taktSec: number;
  stations: CyclePercentiles[];
  /** Pace-setter by MEAN cycle. */
  bottleneckId: string | null;
  bottleneckName: string | null;
  /** Line pace at the bottleneck's p95 — the tail cycle that starves the line. */
  p95PaceSec: number | null;
  /** Probability every process step clears takt in the same cycle ≈ Π of the
   *  per-station attainments (independent approximation, no buffering). An honest
   *  lower bound on hitting takt with no WIP between steps. null without takt. */
  lineTaktAttainment: number | null;
  /** Fragile stations (mean under takt, p95 over), worst p95 first. */
  fragileStations: CyclePercentiles[];
}

/** CV of a station's cycle: explicit cycleCV, clamped to a sane [0, 1]. */
export function cycleCvOf(s: Station): number {
  return Math.max(0, Math.min(1, s.cycleCV ?? 0));
}

export function cyclePercentiles(s: Station, taktSec = 0): CyclePercentiles {
  const mean = effectiveCycleSec(s);
  const cv = cycleCvOf(s);
  const base = { id: s.id, name: s.name, meanSec: +mean.toFixed(1), cv };
  if (mean <= 0 || cv <= 0) {
    // Deterministic: every percentile is the mean, attainment is a step at takt.
    const attain = taktSec > 0 ? (mean <= taktSec ? 1 : 0) : null;
    return { ...base, p50Sec: +mean.toFixed(1), p95Sec: +mean.toFixed(1), p99Sec: +mean.toFixed(1), taktAttainment: attain, fragile: false };
  }
  const { m, s: sigma } = logParams(mean, cv);
  const q = (z: number) => Math.exp(m + sigma * z);
  const p50 = q(0);
  const p95 = q(Z95);
  const p99 = q(Z99);
  const taktAttainment = taktSec > 0 ? +normCdf((Math.log(taktSec) - m) / sigma).toFixed(4) : null;
  const fragile = taktSec > 0 && mean <= taktSec && p95 > taktSec;
  return {
    ...base,
    p50Sec: +p50.toFixed(1),
    p95Sec: +p95.toFixed(1),
    p99Sec: +p99.toFixed(1),
    taktAttainment,
    fragile,
  };
}

export function lineVariability(model: Model): LineVariability {
  const takt = customerTaktSec(model);
  const proc = model.stations.filter((s) => s.role === "process" && !isFlowFunction(s));
  const stations = proc.map((s) => cyclePercentiles(s, takt));
  const hasData = stations.some((p) => p.cv > 0);

  // Bottleneck = the largest mean cycle (the pace-setter this view frames).
  const bn: CyclePercentiles | null = stations.length
    ? stations.reduce((a, p) => (p.meanSec > a.meanSec ? p : a))
    : null;

  const lineTaktAttainment =
    takt > 0 && stations.length > 0
      ? +stations.reduce((prod, p) => prod * (p.taktAttainment ?? 1), 1).toFixed(4)
      : null;

  const fragileStations = stations.filter((p) => p.fragile).sort((a, b) => b.p95Sec - a.p95Sec);

  return {
    hasData,
    taktSec: takt,
    stations,
    bottleneckId: bn ? bn.id : null,
    bottleneckName: bn ? bn.name : null,
    p95PaceSec: bn ? bn.p95Sec : null,
    lineTaktAttainment,
    fragileStations,
  };
}
