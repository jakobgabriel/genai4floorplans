import type { Model } from "../model/types";
import type { Rating } from "../engine/rating";
import type { ValidationResult } from "../engine/validate";
import type { ChainResult } from "../engine/automation";
import type { ModelAction } from "../store/reducer";

// Contracts for the GenAI layer. Governing rule: the AI only ever emits a Model
// or a list of ModelActions. All numbers (KPIs, grade, deltas) come from the
// engine via verify.ts — the AI never supplies its own scores.

export interface KpiDeltas {
  composite: number;
  flowCost: number;
  travel: number;
  congestion: number;
  placement: number;
  balance: number;
  ergo: number;
  auto: number;
}

export interface Proposal {
  id: string;
  strategy: string;
  title: string;
  rationale: string;
  /** Candidate layout. Always present and engine-scored. */
  model: Model;
  before: Rating;
  after: Rating;
  deltas: KpiDeltas;
  source: "heuristic" | "llm";
  confidence?: number;
}

export interface ProposalContext {
  model: Model;
  rating: Rating;
  validation: ValidationResult;
  chain: ChainResult;
}

export interface EditResult {
  actions: ModelAction[];
  summary: string;
  /** Set when the instruction could not be (fully) understood. */
  unresolved?: string;
}

export type GoalObjective = "throughput" | "flowCost" | "composite" | "costPerPart";

export interface GoalConstraints {
  lockedStationIds?: string[];
  allowMoves?: boolean;
  allowParallel?: boolean;
  allowAutomate?: boolean;
  maxParallelAdds?: number;
  capexBudget?: number;
}

export interface GoalSpec {
  objective: GoalObjective;
  /** Optional absolute target for the objective. */
  target?: number;
  constraints: GoalConstraints;
}

export interface GoalStep {
  action: string;
  /** Objective value after applying this step (engine-computed). */
  metric: number;
}

export interface GoalResult {
  /** Final engine-scored proposal (null if nothing improved it). */
  proposal: Proposal | null;
  steps: GoalStep[];
  reached: boolean;
  message: string;
}

/** Base64 image payload for vision ingestion. */
export interface AiImage {
  data: string;
  mediaType: string;
}

export interface AiProvider {
  name: string;
  /** Candidate layouts with rationale; each scored by the engine. */
  propose(ctx: ProposalContext): Promise<Proposal[]>;
  /** Plain-language narration of the current rating & trade-offs. */
  narrate(ctx: ProposalContext): Promise<string>;
  /** Translate a natural-language instruction into validated model actions. */
  edit(ctx: ProposalContext, instruction: string): Promise<EditResult>;
  /** Build an initial model from a pasted routing sheet / CSV / description. */
  ingest(text: string): Promise<Model>;
  /** Generate a full starter model from a free-text brief. */
  design(brief: string): Promise<Model>;
  /** Extract a model from a photo / image (vision; LLM-only). */
  ingestImage(image: AiImage): Promise<Model>;
  /** Search a verified sequence of edits toward a goal under constraints. */
  optimizeGoal(ctx: ProposalContext, goal: GoalSpec): Promise<GoalResult>;
}
