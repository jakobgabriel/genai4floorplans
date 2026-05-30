import type { Flow, Station } from "../model/types";

export interface YieldStep {
  id: string;
  name: string;
  scrapRate: number;
  inflow: number;
  scrapUnits: number;
  goodOut: number;
}

export interface YieldResult {
  steps: YieldStep[];
  /** Rolled throughput yield across process steps with scrap, as a percentage. */
  rolledYield: number;
  /** Total scrap units per shift across all steps. */
  totalScrap: number;
}

// Informational scrap / yield analysis. Inflow per station = Σ incoming flow
// volume (falling back to outgoing for source stations). Not part of the
// composite rating — it's an exploratory lens, per the locked decision.
export function yieldAnalysis(stations: Station[], flows: Flow[]): YieldResult {
  const inn: Record<string, number> = {};
  const out: Record<string, number> = {};
  stations.forEach((s) => {
    inn[s.id] = 0;
    out[s.id] = 0;
  });
  flows.forEach((f) => {
    if (inn[f.to] != null) inn[f.to] += f.volume;
    if (out[f.from] != null) out[f.from] += f.volume;
  });

  const steps: YieldStep[] = [];
  let totalScrap = 0;
  let rolled = 1;
  stations.forEach((s) => {
    if (s.role !== "process") return;
    const rate = Math.max(0, Math.min(1, s.scrapRate ?? 0));
    const inflow = inn[s.id] || out[s.id] || 0;
    const scrapUnits = inflow * rate;
    totalScrap += scrapUnits;
    rolled *= 1 - rate;
    steps.push({ id: s.id, name: s.name, scrapRate: rate, inflow, scrapUnits, goodOut: inflow - scrapUnits });
  });

  return { steps, rolledYield: +(rolled * 100).toFixed(1), totalScrap: Math.round(totalScrap) };
}
