// The single planning process. Every screen in the app is one of these stages —
// including the editor, which is the "Refine" stage rather than a separate tool.

export type FlowStep = "situation" | "demand" | "process" | "concepts" | "refine" | "summary";

export const FLOW_STEPS: FlowStep[] = ["situation", "demand", "process", "concepts", "refine", "summary"];

export const STEP_META: Record<FlowStep, { label: string; hint: string }> = {
  situation: { label: "Situation", hint: "Your use case" },
  demand: { label: "Demand", hint: "How many, how long" },
  process: { label: "Process", hint: "Steps and cycle times" },
  concepts: { label: "Concepts", hint: "Compare and choose" },
  refine: { label: "Refine", hint: "Layout, balance, cost" },
  summary: { label: "Summary", hint: "Decide and export" },
};

/** Steps unlocked once a given step is reached. */
export function reachedThrough(step: FlowStep): FlowStep[] {
  const i = FLOW_STEPS.indexOf(step);
  return FLOW_STEPS.slice(0, i + 1);
}

/** Merge two reached-sets, keeping process order. */
export function widen(a: FlowStep[], b: FlowStep[]): FlowStep[] {
  const set = new Set([...a, ...b]);
  return FLOW_STEPS.filter((s) => set.has(s));
}
