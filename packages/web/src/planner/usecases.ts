// The planner's entry taxonomy: what are you doing, and what do you already
// have? The use case plus its preconditions decide which questions get asked —
// so nobody is shown an input their situation doesn't need.
//
// Mapped to the lifecycle cases in docs/lifecycle-cases-implementation.md.

export type UseCaseId = "new-process" | "choose-concept" | "improve-planned" | "improve-running" | "monitor";

export type Availability = "ready" | "partial" | "unavailable";

export interface UseCase {
  id: UseCaseId;
  label: string;
  /** The question in the planner's words, not the tool's. */
  question: string;
  /** What the planner must already have for this to work. */
  needs: string[];
  /** What they get out. */
  gives: string;
  lifecycle: string;
  availability: Availability;
  /** Shown when availability is not "ready" — states plainly what is missing. */
  caveat?: string;
  /** Steps in the guided flow for this case. */
  steps: StepId[];
}

export type StepId = "demand" | "process" | "concepts" | "review";

export const USE_CASES: UseCase[] = [
  {
    id: "new-process",
    label: "Plan a new process",
    question: "I have a part and a target volume. What should we build?",
    needs: ["Target annual volume", "A list of process steps"],
    gives: "Ranked, costed manufacturing concepts with a sized cell for each.",
    lifecycle: "RFQ / planning — cases 1 & 2",
    availability: "ready",
    steps: ["demand", "process", "concepts", "review"],
  },
  {
    id: "choose-concept",
    label: "Choose a concept",
    question: "I know the process. Which manufacturing concept fits this volume?",
    needs: ["Target annual volume", "Process steps with cycle times"],
    gives: "Concept comparison at your volume, with the cost crossover.",
    lifecycle: "RFQ — case 2",
    availability: "ready",
    steps: ["demand", "process", "concepts", "review"],
  },
  {
    id: "improve-planned",
    label: "Improve a planned cell",
    question: "The cell is designed but not built. Where is the waste?",
    needs: ["An existing layout in FlowPlan"],
    gives: "Bottleneck, line balance, value-add ratio and layout improvements.",
    lifecycle: "Planning — case 3",
    availability: "ready",
    steps: ["review"],
  },
  {
    id: "improve-running",
    label: "Improve a running cell",
    question: "It is in production and underperforming. Why?",
    needs: ["An existing layout", "Measured cycle times, scrap and downtime"],
    gives: "Planned-vs-actual variance and bottleneck migration.",
    lifecycle: "Ramp-up — case 4",
    availability: "partial",
    caveat:
      "FlowPlan cannot yet record measured data, so this compares your plan against itself. Enter observed cycle times over the planned ones to approximate it.",
    steps: ["review"],
  },
  {
    id: "monitor",
    label: "Monitor serial production",
    question: "Is the running cell still hitting what we quoted?",
    needs: ["A live data feed from MES, SCADA or PLC"],
    gives: "Drift against the approved plan, OEE and cost-per-part alerts.",
    lifecycle: "Serial production — case 5",
    availability: "unavailable",
    caveat:
      "Not built. This needs time-series storage and an ingestion adapter — a separate application sharing the same engine. See docs/lifecycle-cases-implementation.md §6.",
    steps: [],
  },
];

export function useCaseById(id: UseCaseId): UseCase {
  return USE_CASES.find((u) => u.id === id) as UseCase;
}

// ---- preconditions --------------------------------------------------------

/** How much the planner knows about cycle times — decides the process step's UI. */
export type CycleKnowledge = "known" | "estimate";

/** Rough complexity → an indicative manual cycle time, for RFQ-stage briefs
 *  where real cycle times do not exist yet. Deliberately coarse: three buckets,
 *  clearly labelled as estimates. */
export const COMPLEXITY_SEC: Record<string, number> = {
  simple: 15,
  moderate: 35,
  complex: 60,
};

export const COMPLEXITY_LABELS: Array<{ id: string; label: string; hint: string }> = [
  { id: "simple", label: "Simple", hint: "Load, place, press — 15s" },
  { id: "moderate", label: "Moderate", hint: "Machining, joining — 35s" },
  { id: "complex", label: "Complex", hint: "Multi-pass, test, rework — 60s" },
];

export const STEP_LABELS: Record<StepId, string> = {
  demand: "Demand",
  process: "Process",
  concepts: "Concepts",
  review: "Review",
};
