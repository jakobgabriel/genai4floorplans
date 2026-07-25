import { useCallback, useEffect, useState } from "react";
import { DECISION_WEIGHTS, normalizeDecisionWeights, type DecisionWeights } from "@flowplan/core/engine/generate";

// What matters when ranking concepts, persisted like the two catalogs.
//
// The ranking was loaded cost per part and nothing else — a defensible
// objective, but only one of several, and it was never stated anywhere in the
// UI. These weights make the objective the planner's and visible. Setting
// everything but `cost` to zero reproduces the old behaviour exactly.

const KEY = "flowplan_decision_weights";

export function loadDecisionWeights(): DecisionWeights {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : d);
        return {
          cost: num(p.cost, DECISION_WEIGHTS.cost),
          capex: num(p.capex, DECISION_WEIGHTS.capex),
          fit: num(p.fit, DECISION_WEIGHTS.fit),
          operators: num(p.operators, DECISION_WEIGHTS.operators),
          flexibility: num(p.flexibility, DECISION_WEIGHTS.flexibility),
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { ...DECISION_WEIGHTS };
}

export interface DecisionWeightsApi {
  weights: DecisionWeights;
  set: (key: keyof DecisionWeights, value: number) => void;
  reset: () => void;
  /** True when nothing has been changed from the shipped weighting. */
  isDefault: boolean;
  /** The weights as shares summing to 1 — what the ranking actually uses. */
  normalized: DecisionWeights;
}

export function useDecisionWeights(): DecisionWeightsApi {
  const [weights, setWeights] = useState<DecisionWeights>(() => loadDecisionWeights());
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(weights));
    } catch {
      /* ignore */
    }
  }, [weights]);

  const set = useCallback((key: keyof DecisionWeights, value: number) => {
    setWeights((w) => ({ ...w, [key]: Math.max(0, value) }));
  }, []);

  const reset = useCallback(() => setWeights({ ...DECISION_WEIGHTS }), []);

  return {
    weights,
    set,
    reset,
    isDefault: (Object.keys(DECISION_WEIGHTS) as Array<keyof DecisionWeights>).every(
      (k) => weights[k] === DECISION_WEIGHTS[k],
    ),
    normalized: normalizeDecisionWeights(weights),
  };
}
