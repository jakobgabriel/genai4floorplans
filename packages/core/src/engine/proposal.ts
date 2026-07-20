import type { Model, Station } from "../model/types";
import { layoutSignature } from "../model/signature";
import { computeKPIs } from "./kpis";
import { clampToGrid } from "./geometry";
import type { Rating } from "./rating";

// Spec §4 — the solver is an advisor.
//
// The optimizer used to write straight into the model: `ADOPT_STATIONS` with
// `rating.optimized`, all-or-nothing. That is the one thing §4 calls a
// correctness requirement rather than a UX preference:
//
//   "One silent overwrite of a deliberate manual placement and the tool is
//    abandoned for Excel permanently."
//
// So the optimizer's output becomes a PROPOSAL — a separate object that is
// never merged implicitly. It carries a mandatory plain-language rationale and
// a predicted effect per §4, it can be accepted one item at a time, it refuses
// to touch pinned stations, and it knows when it has gone stale.
//
// Note what was already right and is kept: `Station.fixed` is the spec's
// `pinned` flag (§14) and `optimize.ts` already honours it. The ghost overlay
// in the IMPROVED view is §2's "ghost preview before commit". This file adds
// what was missing — per-item accept, rationale, and staleness.

/** One station move. Accept or reject independently of its siblings. */
export interface ProposalItem {
  stationId: string;
  name: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Plain-language reason. Mandatory — §4 and Law 6 (show the mechanism). */
  rationale: string;
  /**
   * Predicted flow-cost change if THIS item alone is accepted, as a percentage
   * of the current flow cost. Negative is an improvement.
   */
  flowCostDeltaPct: number;
}

export interface PlacementProposal {
  id: string;
  source: "optimizer";
  title: string;
  /** Whole-proposal rationale and predicted effect. */
  rationale: string;
  items: ProposalItem[];
  /** Flow-cost change if every item is accepted, as a percentage. Negative = better. */
  flowCostDeltaPct: number;
  /**
   * Signature of the model this was computed against. When the live model no
   * longer matches, the proposal is stale — §4 says mark it, never silently
   * drop it.
   */
  baseSignature: string;
}

let pid = 0;

/** Reset the id counter. Tests only — ids are otherwise monotonic per session. */
export function resetProposalIds(): void {
  pid = 0;
}

function flowCostOf(model: Model, stations: Station[]): number {
  return computeKPIs(stations, model.flows, model).flowCost;
}

/** Stations with exactly one station relocated to (x, y). */
function withStationAt(stations: Station[], id: string, x: number, y: number): Station[] {
  return stations.map((s) => (s.id === id ? { ...s, x, y } : s));
}

/**
 * Name the flow partner this move brings the station closest to. Turns a bare
 * coordinate change into a sentence a planner can argue with — Law 6.
 */
function nearestPartnerName(model: Model, station: Station, to: { x: number; y: number }): string | null {
  const byId: Record<string, Station> = {};
  model.stations.forEach((s) => { byId[s.id] = s; });
  const partners = model.flows
    .filter((f) => f.from === station.id || f.to === station.id)
    .map((f) => byId[f.from === station.id ? f.to : f.from])
    .filter((s): s is Station => Boolean(s) && s.id !== station.id);
  if (partners.length === 0) return null;

  let best: Station | null = null;
  let bestD = Infinity;
  for (const p of partners) {
    const d = Math.abs(p.x - to.x) + Math.abs(p.y - to.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best ? best.name : null;
}

function describe(pct: number): string {
  const mag = Math.abs(pct).toFixed(1);
  if (pct < -0.05) return `cuts flow cost ${mag}%`;
  if (pct > 0.05) return `costs ${mag}% more flow`;
  return "no measurable flow-cost change on its own";
}

/**
 * Wrap the optimizer's result as a proposal. Returns null when there is nothing
 * to propose, so callers can render "already optimal" instead of an empty card.
 *
 * Pinned (`fixed`) stations are excluded defensively: `optimize.ts` already
 * refuses to move them, and if that ever regresses this is the second gate.
 */
export function makePlacementProposal(model: Model, rating: Rating): PlacementProposal | null {
  const byIdOpt: Record<string, Station> = {};
  rating.optimized.forEach((s) => { byIdOpt[s.id] = s; });

  const baseCost = flowCostOf(model, model.stations);
  const items: ProposalItem[] = [];

  for (const s of model.stations) {
    const o = byIdOpt[s.id];
    if (!o) continue;
    if (o.x === s.x && o.y === s.y) continue;
    if (s.fixed) continue; // pinned — never proposed

    const soloCost = flowCostOf(model, withStationAt(model.stations, s.id, o.x, o.y));
    const pct = baseCost > 0 ? ((soloCost - baseCost) / baseCost) * 100 : 0;
    const partner = nearestPartnerName(model, s, { x: o.x, y: o.y });

    items.push({
      stationId: s.id,
      name: s.name,
      from: { x: s.x, y: s.y },
      to: { x: o.x, y: o.y },
      rationale: partner
        ? `Move ${s.name} nearer ${partner} — ${describe(pct)}.`
        : `Move ${s.name} to (${o.x}, ${o.y}) — ${describe(pct)}.`,
      flowCostDeltaPct: +pct.toFixed(2),
    });
  }

  if (items.length === 0) return null;

  const allCost = flowCostOf(model, applyProposalItems(model, items, items.map((i) => i.stationId)));
  const allPct = baseCost > 0 ? ((allCost - baseCost) / baseCost) * 100 : 0;

  return {
    id: "pp" + ++pid,
    source: "optimizer",
    title: `Relocate ${items.length} station${items.length === 1 ? "" : "s"}`,
    rationale:
      `The optimizer would move ${items.length} station${items.length === 1 ? "" : "s"} to shorten material flow, ` +
      `${describe(allPct)} overall. Accept them individually or together — nothing moves until you do.`,
    items,
    flowCostDeltaPct: +allPct.toFixed(2),
    baseSignature: layoutSignature(model),
  };
}

/**
 * Apply the accepted subset. This is the ONLY way a solver result reaches the
 * model. Unaccepted items are left untouched, pinned stations are never moved,
 * and every destination is clamped to the grid.
 */
export function applyProposalItems(model: Model, items: ProposalItem[], acceptedIds: string[]): Station[] {
  const accept = new Set(acceptedIds);
  return model.stations.map((s) => {
    if (!accept.has(s.id)) return s;
    if (s.fixed) return s; // pinned wins over any proposal
    const item = items.find((i) => i.stationId === s.id);
    if (!item) return s;
    const { x, y } = clampToGrid(s, item.to.x, item.to.y, model.gridW, model.gridH);
    return x === s.x && y === s.y ? s : { ...s, x, y };
  });
}

/**
 * True when the model has changed underneath an outstanding proposal. §4: mark
 * it stale rather than deleting it silently — the user decides what to do.
 */
export function isProposalStale(proposal: PlacementProposal, model: Model): boolean {
  return proposal.baseSignature !== layoutSignature(model);
}
