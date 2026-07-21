import type { Confidence, ErgonomicLoad, VariantMode, WasteClass, WorkClass, WorkElement } from "../model/types";
import { DEFAULT_LOSS_FACTOR, weakestConfidence } from "../model/types";

// Mixed-model workload analysis (Cell Design spec §3.2, §5.2).
//
// The question this answers: a line runs 40 products — how do you plan it?
//
// You do not model 40 products. You model *variant modes*: abstract shares of
// output that differ in WORK CONTENT. Forty part numbers needing the same work
// are one mode. A mode exists only where the work genuinely differs.
//
// The trap this module exists to catch: balancing on the mix-weighted average
// alone. A station can sit comfortably under takt on average and still be
// infeasible for the heaviest variant, which then starves the line every time
// that variant runs. So every figure is computed twice — weighted and
// worst-case — and the gap between them is reported.

/** A single implicit mode, used when a model declares none. */
export const SINGLE_MODE: VariantMode = { id: "__single", name: "Single model", share: 1, elementOverrides: {} };

/** Modes to analyse against: the declared ones, or one implicit single mode. */
export function modesOf(modes: VariantMode[] | undefined): VariantMode[] {
  return modes && modes.length > 0 ? modes : [SINGLE_MODE];
}

/** Time multiplier this mode applies to an element (1.0 when unspecified). */
export function multiplierFor(mode: VariantMode, elementId: string): number {
  const m = mode.elementOverrides[elementId];
  return m == null ? 1 : Math.max(0, m);
}

/** Shares renormalised to sum to 1, so a mis-entered mix can't skew the maths. */
export function normalizedShares(modes: VariantMode[]): number[] {
  const raw = modes.map((m) => Math.max(0, m.share));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return modes.map(() => 1 / modes.length);
  return raw.map((r) => r / sum);
}

/** A ranked bucket of one of the seven wastes (audit B-05). */
export interface WasteBucket {
  wasteClass: WasteClass;
  /** Mix-weighted seconds carrying this waste. */
  sec: number;
  /** Share of all CLASSIFIED waste seconds (non-VA elements that carry a waste
   *  class), %. Elements tagged NNVA/NVA without a waste class are not counted. */
  sharePct: number;
}

export interface ElementLoad {
  elementId: string;
  name: string;
  classification: WorkClass;
  /** The seven-wastes tag, when the element is NNVA/NVA. */
  wasteClass?: WasteClass;
  ergonomicLoad: ErgonomicLoad;
  /** Mix-weighted mean seconds — what average throughput planning uses. */
  weightedSec: number;
  /** Seconds in the heaviest mode — what station feasibility must use. */
  maxSec: number;
  worstModeId: string;
  /** Modes in which this element is skipped entirely (multiplier 0). */
  skippedInModeIds: string[];
  /** Weighted operator-bound seconds (weightedSec × attendedFraction). */
  attendedSec: number;
  confidence: Confidence;
}

export interface ModeTotals {
  modeId: string;
  name: string;
  share: number;
  totalSec: number;
  attendedSec: number;
  /** Theoretical minimum stations for this mode alone at the given takt. */
  minStations: number | null;
}

export interface WorkloadAnalysis {
  elements: ElementLoad[];
  modes: ModeTotals[];
  /** Mix-weighted total work content. */
  weightedTotalSec: number;
  /** Work content of the heaviest single mode. */
  worstTotalSec: number;
  worstModeId: string;
  /** How much heavier the worst mode is than the average, %. */
  mixSpreadPct: number;
  vaSec: number;
  nnvaSec: number;
  nvaSec: number;
  vaPct: number | null;
  /** The seven wastes ranked by weighted seconds — a lean Pareto of where the
   *  non-value-add time actually sits (audit B-05). Empty when no element
   *  carries a waste class. */
  wastePareto: WasteBucket[];
  attendedTotalSec: number;
  /** Operator-bound share of the weighted content — drives manning. */
  attendedPct: number | null;
  /** ceil(weighted total ÷ takt). Theoretical minimum — no loss allowance. */
  minStationsWeighted: number | null;
  /** ceil(worst mode total ÷ takt). Feasibility figure. */
  minStationsWorst: number | null;
  /** (weighted total ÷ takt) × lossFactor, UNROUNDED. The realistic station
   *  count once walking/reaching/handling/balancing loss is allowed for. The
   *  decimal is meaningful — it says how much headroom remains — so it is never
   *  silently rounded (spec / IE blueprint "never round the station count"). */
  stationsCalculated: number | null;
  /** Same, against the heaviest mode — the count feasibility actually requires. */
  stationsCalculatedWorst: number | null;
  /** The loss factor these calculated counts were derived with. */
  lossFactor: number;
  /** Elements whose worst-case time alone exceeds takt — they cannot fit one
   *  station at any balance and must be split, automated or paralleled. */
  overTaktElements: ElementLoad[];
  confidence: Confidence;
  issues: string[];
}

/**
 * Analyse a workload across its mix.
 *
 * `taktSec` is optional; without it the station counts are null but every time
 * figure is still produced.
 */
export function analyseWorkload(
  elements: WorkElement[],
  variantModes: VariantMode[] | undefined,
  taktSec?: number,
  lossFactor: number = DEFAULT_LOSS_FACTOR,
): WorkloadAnalysis {
  const modes = modesOf(variantModes);
  const shares = normalizedShares(modes);
  const hasTakt = taktSec != null && taktSec > 0;
  const lf = lossFactor > 0 ? lossFactor : DEFAULT_LOSS_FACTOR;

  const loads: ElementLoad[] = elements.map((el) => {
    const perMode = modes.map((m) => el.time.seconds * multiplierFor(m, el.id));
    const weighted = perMode.reduce((a, sec, i) => a + sec * shares[i], 0);
    let maxSec = -Infinity;
    let worstModeId = modes[0].id;
    perMode.forEach((sec, i) => {
      if (sec > maxSec) {
        maxSec = sec;
        worstModeId = modes[i].id;
      }
    });
    return {
      elementId: el.id,
      name: el.name,
      classification: el.classification,
      wasteClass: el.wasteClass,
      ergonomicLoad: el.ergonomicLoad,
      weightedSec: +weighted.toFixed(2),
      maxSec: +Math.max(0, maxSec).toFixed(2),
      worstModeId,
      skippedInModeIds: modes.filter((m) => multiplierFor(m, el.id) === 0).map((m) => m.id),
      attendedSec: +(weighted * clamp01(el.attendedFraction)).toFixed(2),
      confidence: el.time.confidence,
    };
  });

  const modeTotals: ModeTotals[] = modes.map((m, i) => {
    const total = elements.reduce((a, el) => a + el.time.seconds * multiplierFor(m, el.id), 0);
    const attended = elements.reduce(
      (a, el) => a + el.time.seconds * multiplierFor(m, el.id) * clamp01(el.attendedFraction),
      0,
    );
    return {
      modeId: m.id,
      name: m.name,
      share: +shares[i].toFixed(4),
      totalSec: +total.toFixed(2),
      attendedSec: +attended.toFixed(2),
      minStations: hasTakt ? Math.ceil(total / (taktSec as number)) : null,
    };
  });

  const weightedTotalSec = +loads.reduce((a, l) => a + l.weightedSec, 0).toFixed(2);
  const worst = modeTotals.reduce((a, b) => (b.totalSec > a.totalSec ? b : a), modeTotals[0]);
  const attendedTotalSec = +loads.reduce((a, l) => a + l.attendedSec, 0).toFixed(2);

  const byClass = (c: WorkClass) =>
    +loads.filter((l) => l.classification === c).reduce((a, l) => a + l.weightedSec, 0).toFixed(2);
  const vaSec = byClass("VA");
  const nnvaSec = byClass("NNVA");
  const nvaSec = byClass("NVA");

  // Seven-wastes Pareto (audit B-05): aggregate weighted seconds by waste class
  // over every non-value-add element that declares one, ranked heaviest first.
  const wasteSecByClass = new Map<WasteClass, number>();
  loads.forEach((l) => {
    if (l.classification !== "VA" && l.wasteClass) {
      wasteSecByClass.set(l.wasteClass, (wasteSecByClass.get(l.wasteClass) ?? 0) + l.weightedSec);
    }
  });
  const totalWasteSec = [...wasteSecByClass.values()].reduce((a, b) => a + b, 0);
  const wastePareto: WasteBucket[] = [...wasteSecByClass.entries()]
    .map(([wasteClass, sec]) => ({
      wasteClass,
      sec: +sec.toFixed(2),
      sharePct: totalWasteSec > 0 ? +((sec / totalWasteSec) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.sec - a.sec || a.wasteClass.localeCompare(b.wasteClass));

  const overTaktElements = hasTakt ? loads.filter((l) => l.maxSec > (taktSec as number)) : [];

  const issues: string[] = [];
  const declaredSum = modes.reduce((a, m) => a + Math.max(0, m.share), 0);
  if (variantModes && variantModes.length > 0 && Math.abs(declaredSum - 1) > 0.02) {
    issues.push(`Mix shares sum to ${(declaredSum * 100).toFixed(0)}% — they have been renormalised to 100%.`);
  }
  const knownIds = new Set(elements.map((e) => e.id));
  modes.forEach((m) => {
    Object.keys(m.elementOverrides).forEach((id) => {
      if (!knownIds.has(id)) issues.push(`${m.name}: override references unknown element "${id}".`);
    });
  });
  if (hasTakt && worst && worst.totalSec > weightedTotalSec * 1.15) {
    issues.push(
      `${worst.name} carries ${(((worst.totalSec - weightedTotalSec) / weightedTotalSec) * 100).toFixed(0)}% more work than the mix average — balance to the worst mode, not the average, or that variant will starve the line.`,
    );
  }
  overTaktElements.forEach((l) => {
    issues.push(`"${l.name}" needs ${l.maxSec}s in its heaviest mode, above the ${taktSec}s takt — it cannot fit one station.`);
  });
  elements.forEach((el) => {
    if (el.predecessors.some((p) => !knownIds.has(p))) issues.push(`"${el.name}": unknown predecessor.`);
  });

  return {
    elements: loads,
    modes: modeTotals,
    weightedTotalSec,
    worstTotalSec: worst?.totalSec ?? 0,
    worstModeId: worst?.modeId ?? "",
    mixSpreadPct: weightedTotalSec > 0 ? +(((worst.totalSec - weightedTotalSec) / weightedTotalSec) * 100).toFixed(1) : 0,
    vaSec,
    nnvaSec,
    nvaSec,
    vaPct: weightedTotalSec > 0 ? +((vaSec / weightedTotalSec) * 100).toFixed(1) : null,
    wastePareto,
    attendedTotalSec,
    attendedPct: weightedTotalSec > 0 ? +((attendedTotalSec / weightedTotalSec) * 100).toFixed(1) : null,
    minStationsWeighted: hasTakt ? Math.ceil(weightedTotalSec / (taktSec as number)) : null,
    minStationsWorst: hasTakt ? Math.ceil((worst?.totalSec ?? 0) / (taktSec as number)) : null,
    stationsCalculated: hasTakt ? +((weightedTotalSec / (taktSec as number)) * lf).toFixed(2) : null,
    stationsCalculatedWorst: hasTakt ? +(((worst?.totalSec ?? 0) / (taktSec as number)) * lf).toFixed(2) : null,
    lossFactor: lf,
    overTaktElements,
    confidence: weakestConfidence(elements.map((e) => e.time.confidence)),
    issues,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n ?? 0));
}

/** Topological order over the precedence DAG; returns null if it has a cycle. */
export function precedenceOrder(elements: WorkElement[]): string[] | null {
  const indeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  const ids = new Set(elements.map((e) => e.id));
  elements.forEach((e) => {
    indeg[e.id] = indeg[e.id] ?? 0;
    adj[e.id] = adj[e.id] ?? [];
  });
  elements.forEach((e) => {
    e.predecessors.filter((p) => ids.has(p)).forEach((p) => {
      adj[p].push(e.id);
      indeg[e.id]++;
    });
  });
  const queue = elements.filter((e) => indeg[e.id] === 0).map((e) => e.id);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift() as string;
    order.push(n);
    adj[n].forEach((m) => {
      if (--indeg[m] === 0) queue.push(m);
    });
  }
  return order.length === elements.length ? order : null;
}

/** A blank element with sane defaults, for the editor. */
export function makeWorkElement(id: string, name: string, seconds: number): WorkElement {
  return {
    id,
    name,
    predecessors: [],
    time: { seconds, method: "estimate", confidence: "low" },
    classification: "VA",
    attendedFraction: 1,
    ergonomicLoad: "light",
  };
}
