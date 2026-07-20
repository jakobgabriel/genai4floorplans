import type { CycleBreakdown, CycleKey, Station } from "../model/types";
import { CYCLE_KEYS, sumCycle } from "../model/types";

// Cycle-time decomposition (spec: lifecycle case 3).
//
// A station's per-part cycle is either an opaque scalar (cycleTimeSec, the
// legacy shape) or a CycleBreakdown splitting it into value-add plus four
// non-value-add classes. effectiveCycleSec is the single place the engine reads
// a cycle time, so the two shapes never diverge.

/** The one and only cycle-time read used by the engine. */
export function effectiveCycleSec(s: Station): number {
  return s.cycle ? sumCycle(s.cycle) : s.cycleTimeSec;
}

/** True when the station's cycle has been split into components. */
export function isDecomposed(s: Station): boolean {
  return s.cycle != null;
}

/** Human labels for the stacked-bar / Yamazumi view. */
export const CYCLE_LABELS: Record<CycleKey, string> = {
  valueAddSec: "Value add",
  handlingSec: "Handling",
  walkSec: "Walk",
  waitSec: "Wait",
  setupSec: "Setup",
};

/** Only valueAddSec adds value; the rest is waste by definition. */
export function isValueAdd(key: CycleKey): boolean {
  return key === "valueAddSec";
}

export interface CycleSegment {
  key: CycleKey;
  label: string;
  sec: number;
  valueAdd: boolean;
}

export interface StationCycle {
  id: string;
  name: string;
  /** False when the station still carries only an opaque cycleTimeSec. */
  decomposed: boolean;
  totalSec: number;
  /** Empty when not decomposed — callers must not invent a split. */
  segments: CycleSegment[];
  valueAddSec: number;
  nonValueAddSec: number;
  /** null when not decomposed, so the UI can say "unknown" instead of "0%". */
  valueAddPct: number | null;
  /** Share of takt this station consumes. null when takt is unknown. */
  taktPct: number | null;
  /** True when the station cannot meet takt on its own. */
  overTakt: boolean;
}

export interface WasteEntry {
  stationId: string;
  stationName: string;
  key: CycleKey;
  label: string;
  sec: number;
  /** Share of all non-value-add seconds in the cell. */
  sharePct: number;
}

export interface CycleAnalysis {
  stations: StationCycle[];
  decomposedCount: number;
  totalCount: number;
  /** True once every process station has a breakdown — the line-level numbers
   *  below are only trustworthy at that point. */
  complete: boolean;
  lineValueAddSec: number;
  lineNonValueAddSec: number;
  lineTotalSec: number;
  /** null until at least one station is decomposed. */
  lineValueAddPct: number | null;
  /** Non-value-add classes ranked by seconds — the improvement backlog. */
  waste: WasteEntry[];
}

function segmentsOf(c: CycleBreakdown): CycleSegment[] {
  return CYCLE_KEYS.map((key) => ({
    key,
    label: CYCLE_LABELS[key],
    sec: c[key],
    valueAdd: isValueAdd(key),
  })).filter((seg) => seg.sec > 0);
}

/**
 * Per-station and line-level value-add analysis over the process steps.
 *
 * `takt` (seconds/part, from balanceAnalysis) is optional; pass it to get
 * taktPct and the over-takt flag for a Yamazumi chart.
 */
export function cycleAnalysis(stations: Station[], takt?: number): CycleAnalysis {
  const proc = stations.filter((s) => s.role === "process");
  const hasTakt = takt != null && takt > 0;

  const rows: StationCycle[] = proc.map((s) => {
    const total = effectiveCycleSec(s);
    const decomposed = isDecomposed(s);
    const va = decomposed ? (s.cycle as CycleBreakdown).valueAddSec : 0;
    const nva = decomposed ? total - va : 0;
    return {
      id: s.id,
      name: s.name,
      decomposed,
      totalSec: +total.toFixed(3),
      segments: decomposed ? segmentsOf(s.cycle as CycleBreakdown) : [],
      valueAddSec: +va.toFixed(3),
      nonValueAddSec: +nva.toFixed(3),
      valueAddPct: decomposed && total > 0 ? +((va / total) * 100).toFixed(1) : decomposed ? 0 : null,
      taktPct: hasTakt && total > 0 ? +((total / (takt as number)) * 100).toFixed(1) : null,
      overTakt: hasTakt ? total > (takt as number) : false,
    };
  });

  const decomposedRows = rows.filter((r) => r.decomposed);
  const lineValueAddSec = +decomposedRows.reduce((a, r) => a + r.valueAddSec, 0).toFixed(3);
  const lineNonValueAddSec = +decomposedRows.reduce((a, r) => a + r.nonValueAddSec, 0).toFixed(3);
  const lineTotalSec = +(lineValueAddSec + lineNonValueAddSec).toFixed(3);

  // Waste backlog: every non-value-add segment across the cell, biggest first.
  const flat: Array<{ stationId: string; stationName: string; key: CycleKey; label: string; sec: number }> = [];
  decomposedRows.forEach((r) => {
    r.segments.forEach((seg) => {
      if (!seg.valueAdd) flat.push({ stationId: r.id, stationName: r.name, key: seg.key, label: seg.label, sec: seg.sec });
    });
  });
  const wasteTotal = flat.reduce((a, x) => a + x.sec, 0);
  const waste: WasteEntry[] = flat
    .sort((a, b) => b.sec - a.sec)
    .map((x) => ({ ...x, sharePct: wasteTotal > 0 ? +((x.sec / wasteTotal) * 100).toFixed(1) : 0 }));

  return {
    stations: rows,
    decomposedCount: decomposedRows.length,
    totalCount: rows.length,
    complete: rows.length > 0 && decomposedRows.length === rows.length,
    lineValueAddSec,
    lineNonValueAddSec,
    lineTotalSec,
    lineValueAddPct: decomposedRows.length > 0 && lineTotalSec > 0 ? +((lineValueAddSec / lineTotalSec) * 100).toFixed(1) : null,
    waste,
  };
}

/** Seed a breakdown from an opaque cycle time, so the editor has a starting
 *  point. All of it lands in value-add — deliberately optimistic, because the
 *  planner is then forced to move seconds out into the waste classes rather
 *  than accept a fabricated split. */
export function seedBreakdown(s: Station): CycleBreakdown {
  return { valueAddSec: s.cycleTimeSec, handlingSec: 0, walkSec: 0, waitSec: 0, setupSec: 0 };
}

/** Actionable suggestions from the waste profile. Mirrors bottleneckAdvice's
 *  tone: concrete, and only emitted when the data supports it. */
export function cycleAdvice(analysis: CycleAnalysis): string[] {
  const tips: string[] = [];
  if (analysis.decomposedCount === 0) return tips;

  if (analysis.lineValueAddPct != null) {
    tips.push(
      `Value-add ratio is ${analysis.lineValueAddPct}% across ${analysis.decomposedCount} decomposed step(s) — ${analysis.lineNonValueAddSec}s of every ${analysis.lineTotalSec}s is waste.`,
    );
  }
  const worst = analysis.waste[0];
  if (worst) {
    tips.push(`Biggest single loss: ${worst.label.toLowerCase()} at ${worst.stationName} (${worst.sec}s, ${worst.sharePct}% of all waste).`);
  }
  // Class totals: attack the dominant class, not just the dominant station.
  const byClass = new Map<CycleKey, number>();
  analysis.waste.forEach((w) => byClass.set(w.key, (byClass.get(w.key) ?? 0) + w.sec));
  const topClass = [...byClass.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topClass && byClass.size > 1) {
    tips.push(`${CYCLE_LABELS[topClass[0]]} is the dominant waste class cell-wide (${+topClass[1].toFixed(1)}s total) — fix it as a pattern, not per station.`);
  }
  const over = analysis.stations.filter((s) => s.overTakt);
  if (over.length) {
    tips.push(`Over takt: ${over.map((s) => s.name).join(", ")} — cannot meet demand without removing work or adding a lane.`);
  }
  if (!analysis.complete && analysis.decomposedCount > 0) {
    tips.push(`${analysis.totalCount - analysis.decomposedCount} of ${analysis.totalCount} steps are not decomposed — line ratio covers the decomposed steps only.`);
  }
  return tips;
}
