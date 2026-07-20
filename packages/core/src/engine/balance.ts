import type { CycleBreakdown, Flow, Station } from "../model/types";
import { CYCLE_KEYS, DEFAULT_SHIFT_HOURS } from "../model/types";
import { topoOrder } from "./dag";
import { CYCLE_LABELS, effectiveCycleSec } from "./cycle";

export interface BalanceStep {
  id: string;
  name: string;
  rate: number;
  cycle: number;
  util: number;
  units: number;
}

export interface SyncWaiter {
  id: string;
  name: string;
  rate: number;
  idle: number;
  buffer: number;
}

export interface SyncWait {
  mergeId: string;
  mergeName: string;
  bindingId: string;
  bindingName: string;
  bindingRate: number;
  waiters: SyncWaiter[];
}

export interface BalanceResult {
  steps: BalanceStep[];
  bottleneck: BalanceStep | null;
  lineOut: number;
  maxRate: number;
  score: number;
  takt: number;
  /** Longest cumulative-cycle route through the flow (station ids, source→end). */
  criticalPath: string[];
  /** Synchronized merges where faster branches idle waiting on the slowest. */
  syncWaits: SyncWait[];
}

function shiftSeconds(hours: number): number {
  return hours * 3600;
}

// Effective parts/shift one resource at a step can output (cycle- or capacity-
// bound). Multiply by parallelUnits for the step's full capacity (see capacityOf).
export function stationRate(s: Station, shiftHours: number = DEFAULT_SHIFT_HOURS): number {
  const hours = s.shiftHours ?? shiftHours;
  const cycleSec = effectiveCycleSec(s);
  const byCycle =
    cycleSec > 0
      ? Math.floor((3600 / cycleSec) * hours * Math.max(1, s.operators))
      : Infinity;
  const cap = s.capacityPerShift > 0 ? s.capacityPerShift : Infinity;
  const r = Math.min(byCycle, cap);
  return isFinite(r) ? r : cap === Infinity ? byCycle : cap;
}

/** Full step capacity = single-resource rate × parallel units. */
function capacityOf(s: Station, shiftHours: number): number {
  if (s.role === "process") {
    const r = stationRate(s, shiftHours);
    return (isFinite(r) ? r : Infinity) * Math.max(1, s.parallelUnits ?? 1);
  }
  return s.capacityPerShift > 0 ? s.capacityPerShift : Infinity;
}

/** Normalized share of a distribute out-flow (absent shares default to equal). */
function shareOf(flow: Flow, siblings: Flow[]): number {
  const n = siblings.length || 1;
  const weights = siblings.map((f) => (f.share != null ? f.share : 1 / n));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const idx = siblings.indexOf(flow);
  return weights[idx] / sum;
}

// Actionable, bottleneck-aware suggestions — recommends lifting the constraint
// (now including adding a parallel lane) rather than just moving boxes.
export function bottleneckAdvice(bal: BalanceResult, stations: Station[]): string[] {
  const tips: string[] = [];
  const bn = bal.bottleneck;
  if (!bn) return tips;
  const st = stations.find((s) => s.id === bn.id);
  tips.push(`${bn.name} caps the line at ${bal.lineOut.toLocaleString()} parts/shift (takt ≈ ${bal.takt}s).`);
  if (st) {
    const units = Math.max(1, st.parallelUnits ?? 1);
    const withLane = Math.round((bn.rate / units) * (units + 1));
    tips.push(`Parallelize: another identical lane (×${units + 1}) would lift this step to ~${withLane.toLocaleString()}/shift.`);
  }
  if (st && st.changeoverMin > 30) tips.push(`Reduce changeover (${st.changeoverMin} min) with SMED — it eats into available run time.`);
  if (st) {
    const cyc = effectiveCycleSec(st);
    if (st.cycle) {
      // Decomposed: name the largest non-value-add class instead of the vague
      // "shorten cycle time" — that is the whole point of decomposing.
      const nva = CYCLE_KEYS.filter((k) => k !== "valueAddSec")
        .map((k) => ({ k, sec: (st.cycle as CycleBreakdown)[k] }))
        .filter((x) => x.sec > 0)
        .sort((a, b) => b.sec - a.sec)[0];
      if (nva) {
        const pct = cyc > 0 ? Math.round((nva.sec / cyc) * 100) : 0;
        tips.push(
          `Cycle is ${cyc}s, of which ${nva.sec}s (${pct}%) is ${CYCLE_LABELS[nva.k].toLowerCase()} — remove that before buying capacity.`,
        );
      } else {
        tips.push(`Cycle is ${cyc}s and fully value-add — raising this ceiling needs process change, not waste removal.`);
      }
    } else if (cyc > 0) {
      tips.push(`Shorten cycle time (${cyc}s) via tooling/automation to raise the ceiling.`);
    }
  }
  const secondSlowest = bal.steps
    .filter((s) => s.id !== bn.id && s.rate > 0)
    .sort((a, b) => a.rate - b.rate)[0];
  if (secondSlowest)
    tips.push(`Headroom: the next-slowest step (${secondSlowest.name}) runs at ${secondSlowest.rate.toLocaleString()}/shift — the realistic target after fixing the constraint.`);
  return tips;
}

// DAG-aware line balance. A feed-forward pass over a topological order computes
// each node's throughput T = min(capacity, feed); feed honors distribute/fork
// splits and sum/assemble merges. For a serial chain this reduces to
// min(capacity), so existing serial models score identically.
export function balanceAnalysis(
  stations: Station[],
  flows: Flow[],
  shiftHours: number = DEFAULT_SHIFT_HOURS,
): BalanceResult {
  const proc = stations.filter((s) => s.role === "process");
  const empty: BalanceResult = { steps: [], bottleneck: null, lineOut: 0, maxRate: 0, score: 100, takt: 0, criticalPath: [], syncWaits: [] };
  if (proc.length === 0) return empty;

  const byId: Record<string, Station> = {};
  stations.forEach((s) => (byId[s.id] = s));
  const outFlows: Record<string, Flow[]> = {};
  const inFlows: Record<string, Flow[]> = {};
  stations.forEach((s) => {
    outFlows[s.id] = [];
    inFlows[s.id] = [];
  });
  flows.forEach((f) => {
    if (byId[f.from] && byId[f.to]) {
      outFlows[f.from].push(f);
      inFlows[f.to].push(f);
    }
  });

  const capacity: Record<string, number> = {};
  stations.forEach((s) => (capacity[s.id] = capacityOf(s, shiftHours)));

  const order = topoOrder(stations, flows);
  const T: Record<string, number> = {};
  const syncWaits: SyncWait[] = [];

  order.forEach((id) => {
    const s = byId[id];
    if (!s) return;
    const ins = inFlows[id];
    let feed: number;
    if (ins.length === 0) {
      feed = Infinity;
    } else {
      const contribs = ins.map((f) => {
        const src = byId[f.from];
        const ts = T[f.from] ?? 0;
        const split = src?.splitMode ?? "distribute";
        const c = split === "fork" ? ts : ts * shareOf(f, outFlows[f.from]);
        return { f, c };
      });
      if ((s.mergeMode ?? "sum") === "assemble" && contribs.length >= 2) {
        const perUnit = contribs.map((x) => x.c / Math.max(1, x.f.unitsPerAssembly ?? 1));
        feed = Math.min(...perUnit);
        const bindingRate = feed;
        const bindingIdx = perUnit.indexOf(bindingRate);
        const waiters: SyncWaiter[] = [];
        contribs.forEach((x, i) => {
          if (i === bindingIdx) return;
          const consumed = bindingRate * Math.max(1, x.f.unitsPerAssembly ?? 1);
          const idle = Math.max(0, x.c - consumed);
          if (idle > 0.5) waiters.push({ id: x.f.from, name: byId[x.f.from]?.name ?? x.f.from, rate: Math.round(x.c), idle: Math.round(idle), buffer: Math.round((idle * 30) / (60 * (s.shiftHours ?? shiftHours))) });
        });
        if (waiters.length) {
          const bsrc = byId[contribs[bindingIdx].f.from];
          syncWaits.push({ mergeId: id, mergeName: s.name, bindingId: bsrc?.id ?? "", bindingName: bsrc?.name ?? "", bindingRate: Math.round(bindingRate), waiters });
        }
      } else {
        feed = contribs.reduce((a, x) => a + x.c, 0);
      }
    }
    T[id] = Math.min(capacity[id] ?? Infinity, feed);
  });

  const outputs = stations.filter((s) => s.role === "output");
  const sinks = outputs.length ? outputs : stations.filter((s) => outFlows[s.id].length === 0);
  const lineOut = Math.round(sinks.reduce((a, s) => a + (isFinite(T[s.id]) ? T[s.id] : 0), 0));

  const steps: BalanceStep[] = proc.map((s) => {
    const cap = capacity[s.id];
    const t = T[s.id] ?? 0;
    const rate = isFinite(cap) ? Math.round(cap) : 0;
    return { id: s.id, name: s.name, cycle: effectiveCycleSec(s), units: Math.max(1, s.parallelUnits ?? 1), rate, util: rate > 0 ? Math.round((t / cap) * 100) : 0 };
  });
  const finite = steps.filter((x) => x.rate > 0);
  const maxRate = finite.length ? Math.max(...finite.map((x) => x.rate)) : 0;
  const mean = finite.length ? finite.reduce((a, x) => a + x.rate, 0) / finite.length : 0;
  const score = mean > 0 ? Math.round(Math.max(0, Math.min(100, (lineOut / mean) * 100))) : 100;

  // Bottleneck = the capacity-limited process step with the smallest capacity.
  const limited = steps.filter((x) => x.rate > 0 && Math.abs((T[x.id] ?? 0) - x.rate) < 1).sort((a, b) => a.rate - b.rate);
  const bottleneck = limited[0] ?? finite.slice().sort((a, b) => a.rate - b.rate)[0] ?? null;

  const bnHours = (bottleneck && proc.find((p) => p.id === bottleneck.id)?.shiftHours) ?? shiftHours;
  const takt = lineOut > 0 ? +(shiftSeconds(bnHours) / lineOut).toFixed(1) : 0;

  // Critical path: longest cumulative cycle-time route.
  const cp: Record<string, number> = {};
  const parent: Record<string, string | null> = {};
  order.forEach((id) => {
    const s = byId[id];
    const cyc = s?.role === "process" ? effectiveCycleSec(s) : 0;
    let best = -Infinity;
    let par: string | null = null;
    inFlows[id].forEach((f) => {
      const v = cp[f.from] ?? 0;
      if (v > best) {
        best = v;
        par = f.from;
      }
    });
    cp[id] = (best === -Infinity ? 0 : best) + cyc;
    parent[id] = par;
  });
  let endNode = order[0] ?? "";
  let bestCp = -1;
  order.forEach((id) => {
    if ((cp[id] ?? 0) > bestCp) {
      bestCp = cp[id] ?? 0;
      endNode = id;
    }
  });
  const criticalPath: string[] = [];
  for (let n: string | null = endNode; n; n = parent[n]) criticalPath.unshift(n);

  return { steps, bottleneck, lineOut, maxRate, score, takt, criticalPath, syncWaits };
}
