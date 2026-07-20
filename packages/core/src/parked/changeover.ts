import type { ChangeoverEntry, ChangeoverMatrix, LinePortfolio } from "./portfolioModel";

// Changeover lookup and sequencing (spec §15.2, §15.4).
//
// Multi-model means the line stops between products, so changeover is capacity
// consumed. Sequence matters because the cost is pairwise — and populating an
// N×N part matrix by hand is infeasible at 40 parts, hence family grouping.

/** The changeover family a workload belongs to (its own id when unmapped). */
export function familyOf(matrix: ChangeoverMatrix | undefined, workloadId: string): string {
  return matrix?.families[workloadId] ?? workloadId;
}

export interface ChangeoverCost {
  internalSeconds: number;
  externalSeconds: number;
  /** True when no entry matched and the default was used. */
  isDefault: boolean;
  entry?: ChangeoverEntry;
}

/** Cost of switching the line from one workload to another. */
export function changeoverCost(
  matrix: ChangeoverMatrix | undefined,
  fromWorkloadId: string,
  toWorkloadId: string,
): ChangeoverCost {
  if (!matrix) return { internalSeconds: 0, externalSeconds: 0, isDefault: true };

  const from = familyOf(matrix, fromWorkloadId);
  const to = familyOf(matrix, toWorkloadId);
  // Same family: no tooling delta, so nothing to change over.
  if (from === to) return { internalSeconds: 0, externalSeconds: 0, isDefault: false };

  const direct = matrix.entries.find((e) => e.fromFamily === from && e.toFamily === to);
  const reverse = matrix.symmetric
    ? matrix.entries.find((e) => e.fromFamily === to && e.toFamily === from)
    : undefined;
  const entry = direct ?? reverse;

  if (!entry) {
    return {
      internalSeconds: matrix.defaultInternalSeconds,
      externalSeconds: matrix.defaultExternalSeconds ?? 0,
      isDefault: true,
    };
  }
  return { internalSeconds: entry.internalSeconds, externalSeconds: entry.externalSeconds, isDefault: false, entry };
}

export interface SequenceResult {
  order: string[];
  /** Internal (line-stopped) seconds for one full cycle through the order. */
  cycleInternalSeconds: number;
  changeoversPerCycle: number;
  method: "fixed" | "greedy+2opt";
  /** True when some pair fell back to the matrix default. */
  usedDefaults: boolean;
}

/**
 * Order the members to minimise changeover.
 *
 * Asymmetric TSP over the family matrix. Nearest-neighbour from every start,
 * then 2-opt — the spec's tier-M strategy. Deterministic: no randomness, and
 * ties break on workload id so the same portfolio always yields the same order.
 */
export function sequenceMembers(
  workloadIds: string[],
  matrix: ChangeoverMatrix | undefined,
  policy: LinePortfolio["sequencingPolicy"] = "optimized",
): SequenceResult {
  const n = workloadIds.length;
  const cost = (a: string, b: string) => changeoverCost(matrix, a, b).internalSeconds;
  const cycleCost = (order: string[]) =>
    order.reduce((sum, id, i) => sum + cost(id, order[(i + 1) % order.length]), 0);
  const usedDefaults = workloadIds.some((a) => workloadIds.some((b) => a !== b && changeoverCost(matrix, a, b).isDefault));

  if (n <= 1) {
    return { order: workloadIds.slice(), cycleInternalSeconds: 0, changeoversPerCycle: 0, method: "fixed", usedDefaults: false };
  }
  if (policy === "fixed") {
    const order = workloadIds.slice();
    return { order, cycleInternalSeconds: cycleCost(order), changeoversPerCycle: n, method: "fixed", usedDefaults };
  }

  // Nearest neighbour from each possible start, keep the best.
  let best: string[] = workloadIds.slice();
  let bestCost = cycleCost(best);
  for (const start of workloadIds) {
    const remaining = new Set(workloadIds.filter((w) => w !== start));
    const tour = [start];
    while (remaining.size) {
      const last = tour[tour.length - 1];
      let pick = "";
      let pickCost = Infinity;
      // Sorted iteration keeps the choice deterministic on ties.
      [...remaining].sort().forEach((cand) => {
        const c = cost(last, cand);
        if (c < pickCost) {
          pickCost = c;
          pick = cand;
        }
      });
      tour.push(pick);
      remaining.delete(pick);
    }
    const c = cycleCost(tour);
    if (c < bestCost) {
      bestCost = c;
      best = tour;
    }
  }

  // 2-opt: reverse segments while it helps. Bounded so it always terminates.
  let improved = true;
  let guard = 0;
  while (improved && guard < 200) {
    improved = false;
    guard++;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const trial = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const c = cycleCost(trial);
        if (c < bestCost - 1e-9) {
          best = trial;
          bestCost = c;
          improved = true;
        }
      }
    }
  }

  return { order: best, cycleInternalSeconds: +bestCost.toFixed(1), changeoversPerCycle: n, method: "greedy+2opt", usedDefaults };
}

/**
 * Derive a family matrix from tooling deltas (spec §15.2, mitigation 1).
 *
 * changeover = f(resources whose tooling differs between the two families).
 */
export function deriveMatrix(
  lineId: string,
  toolingByFamily: Record<string, string[]>,
  secondsPerToolChange: number,
  defaultInternalSeconds = secondsPerToolChange,
): ChangeoverMatrix {
  const families = Object.keys(toolingByFamily).sort();
  const entries: ChangeoverEntry[] = [];
  families.forEach((from) => {
    families.forEach((to) => {
      if (from === to) return;
      const a = new Set(toolingByFamily[from]);
      const b = new Set(toolingByFamily[to]);
      const changed = [...b].filter((t) => !a.has(t)).length + [...a].filter((t) => !b.has(t)).length;
      entries.push({
        fromFamily: from,
        toFamily: to,
        internalSeconds: changed * secondsPerToolChange,
        externalSeconds: 0,
        confidence: "low", // derived, not measured
      });
    });
  });
  return {
    id: lineId + "-derived",
    lineId,
    families: {},
    entries,
    defaultInternalSeconds,
    symmetric: true,
    confidence: "low",
  };
}
