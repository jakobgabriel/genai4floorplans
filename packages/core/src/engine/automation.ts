import type { Flow, Station } from "../model/types";

export type LinkKind = "manual" | "mixed" | "auto-island" | "chained-auto";

export interface ChainLink extends Flow {
  kind: LinkKind;
}

export interface ChainResult {
  links: ChainLink[];
  islands: number;
}

export interface AutoPotential {
  pct: number;
  src: "override" | "heuristic";
  verdict: "Automate" | "Consider" | "Keep manual";
}

// Heuristic automation score from entered fields (an opinion, not an ROI model,
// per spec §9 — hence the manual override). Ported from the demo.
export function autoHeuristic(s: Station): number {
  let score = 50;
  if (s.type === "machine") score += 25;
  if (s.type === "quality") score += 10;
  if (s.type === "manual") score -= 20;
  if (s.role === "input" || s.role === "output") score -= 10;
  if (s.ergoRisk === "high") score += 20;
  else if (s.ergoRisk === "med") score += 8;
  if (s.cycleTimeSec > 0 && s.cycleTimeSec < 30) score += 10;
  if (s.changeoverMin > 30) score -= 10;
  if (s.capacityPerShift > 1500) score += 8;
  if (s.operators >= 3) score += 10;
  return Math.max(0, Math.min(100, score));
}

export function autoPotential(s: Station): AutoPotential {
  if (s.autoOverride === "yes") return { pct: 90, src: "override", verdict: "Automate" };
  if (s.autoOverride === "no") return { pct: 10, src: "override", verdict: "Keep manual" };
  const pct = autoHeuristic(s);
  const verdict = pct >= 70 ? "Automate" : pct >= 45 ? "Consider" : "Keep manual";
  return { pct, src: "heuristic", verdict };
}

// Per-link chaining: two auto steps joined by a conveyor/agv handoff are
// "chained-auto"; joined by a manual handoff they form an "auto-island" (waste).
export function chainRating(stations: Station[], flows: Flow[]): ChainResult {
  const byId: Record<string, Station> = {};
  stations.forEach((s) => {
    byId[s.id] = s;
  });
  const links: ChainLink[] = flows.map((f) => {
    const a = byId[f.from];
    const b = byId[f.to];
    let kind: LinkKind = "manual";
    if (a && b) {
      const aA = a.auto === "auto";
      const bA = b.auto === "auto";
      const handoffAuto = f.transport === "conveyor" || f.transport === "agv";
      if (aA && bA && handoffAuto) kind = "chained-auto";
      else if (aA && bA && !handoffAuto) kind = "auto-island";
      else if (aA || bA) kind = "mixed";
      else kind = "manual";
    }
    return { ...f, kind };
  });
  const islands = links.filter((l) => l.kind === "auto-island").length;
  return { links, islands };
}

export function autoCoherenceScore(chain: ChainResult): number {
  const n = chain.links.length || 1;
  return Math.round(Math.max(0, Math.min(100, 100 - (chain.islands / n) * 100)));
}

export function ergoScore(stations: Station[], flows: Flow[]): number {
  const load: Record<string, number> = {};
  stations.forEach((s) => {
    load[s.id] = 0;
  });
  flows.forEach((f) => {
    load[f.from] = (load[f.from] || 0) + f.volume;
    load[f.to] = (load[f.to] || 0) + f.volume;
  });
  let totalVol = 0;
  let risk = 0;
  stations.forEach((s) => {
    if (s.role !== "process") return;
    const w = load[s.id] || 0;
    totalVol += w;
    const rf = s.ergoRisk === "high" ? 1 : s.ergoRisk === "med" ? 0.4 : 0;
    risk += rf * w;
  });
  if (totalVol === 0) return 100;
  return Math.round(Math.max(0, Math.min(100, 100 - (risk / totalVol) * 100)));
}
