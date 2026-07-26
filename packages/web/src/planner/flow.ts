// The single planning process. Every screen in the app is one of these stages —
// including the editor, which is the "Refine" stage rather than a separate tool.

// Four stages, from six.
//
// "Situation" asked you to classify yourself into one of four framings of the
// same tool before it would show you anything; that choice is now implicit in
// how you enter — plan something new, or open something that exists.
//
// "Process" asked for one shared routing. Parts each carry their own, and the
// parts are the input now, so a separate step for a list they supersede was a
// screen that mostly said "taken from the parts you listed".
export type FlowStep = "demand" | "concepts" | "refine" | "summary";

export const FLOW_STEPS: FlowStep[] = ["demand", "concepts", "refine", "summary"];

export const STEP_META: Record<FlowStep, { label: string; hint: string }> = {
  demand: { label: "Parts & demand", hint: "What, how many, how long" },
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
