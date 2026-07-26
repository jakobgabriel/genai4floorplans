import type { Confidence, VariantMode, WorkElement } from "../model/types";

// Multi-part line feasibility (spec §15).
//
// The layer above a single workload: N workloads sharing one line, run in
// MULTI-MODEL regime — batches with changeovers between products, not
// simultaneous mixed flow. That choice is load-bearing:
//
//   - there is no single common balance requirement; each workload may have its
//     own station assignment against a fixed physical resource set
//   - changeover is production time lost, subtracted before feasibility
//   - sequence matters, because changeover cost is pairwise
//   - batch size is a decision, not an input

export type Period = "shift" | "day" | "week" | "year";

export type MemberPriority = "must_run" | "should_run" | "optional";

export type SequencingPolicy = "fixed" | "optimized" | "campaign";

/** A named body of work, independent of what is being made (spec §3.2). */
export interface Workload {
  id: string;
  name: string;
  elements: WorkElement[];
  variantModes?: VariantMode[];
  /** Fraction of starts lost at this workload, 0–1. Default 0. */
  scrapRate?: number;
}

export interface PortfolioMember {
  workloadId: string;
  demand: { unitsPerPeriod: number; period: Period };
  priority: MemberPriority;
  batchConstraints?: {
    minBatch?: number;
    maxBatch?: number;
    /** How often this workload runs per year. Drives changeover count. */
    campaignFrequencyPerYear?: number;
  };
}

export interface LinePortfolio {
  id: string;
  version: number;
  lineId: string;
  envelopeId?: string;
  members: PortfolioMember[];
  /** v1 is multi-model only; mixed_model is reserved. */
  regime: "multi_model";
  sequencingPolicy: SequencingPolicy;
  changeoverMatrixId?: string;
}

export interface ChangeoverEntry {
  fromFamily: string;
  toFamily: string;
  /** Line must be stopped for this portion. */
  internalSeconds: number;
  /** Can be prepared while the line runs. */
  externalSeconds: number;
  smedStage?: 1 | 2 | 3;
  requiresSkillClass?: string;
  toolingChanges?: string[];
  confidence: Confidence;
}

/**
 * Family-grouped by default. An N×N part matrix is infeasible to populate by
 * hand at 40+ parts, so workloads map to changeover families and the matrix is
 * family × family (spec §15.2, mitigation 2).
 */
export interface ChangeoverMatrix {
  id: string;
  lineId: string;
  /** workloadId → family id. Unmapped workloads fall back to their own id. */
  families: Record<string, string>;
  entries: ChangeoverEntry[];
  /** Used for any pair with no entry. */
  defaultInternalSeconds: number;
  defaultExternalSeconds?: number;
  symmetric: boolean;
  confidence: Confidence;
}

/** Available production time, per spec §5.1. */
export interface AvailableTime {
  hoursPerShift: number;
  shiftsPerDay: number;
  daysPerYear: number;
  plannedDowntimePct: number;
  availabilityPct: number;
}

export const DEFAULT_AVAILABLE_TIME: AvailableTime = {
  hoursPerShift: 8,
  shiftsPerDay: 2,
  daysPerYear: 230,
  plannedDowntimePct: 0.05,
  availabilityPct: 0.85,
};

/** Which gate a member failed. null = passed every assessed gate. */
export type GateNumber = 1 | 2 | 3 | 4 | 5;

export const GATE_NAMES: Record<GateNumber, string> = {
  1: "Coverage",
  2: "Technical fit",
  3: "Capacity",
  4: "Balance",
  5: "Spatial",
};
