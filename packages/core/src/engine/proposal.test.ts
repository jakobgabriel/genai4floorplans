import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { buildRating } from "./rating";
import { modelReducer } from "../store/reducer";
import { applyProposalItems, isProposalStale, makePlacementProposal, type ProposalItem } from "./proposal";

// Spec §4 — the solver is an advisor. These tests exist to make the adoption
// test the spec names ("one silent overwrite and the tool is abandoned") a
// thing that fails CI rather than a thing someone remembers.

function proposalFor(model = SAMPLE) {
  return makePlacementProposal(model, buildRating(model));
}

describe("makePlacementProposal", () => {
  it("produces items with a rationale and a predicted effect", () => {
    const p = proposalFor();
    expect(p).not.toBeNull();
    expect(p!.items.length).toBeGreaterThan(0);
    for (const it of p!.items) {
      expect(it.rationale.length).toBeGreaterThan(0);
      expect(Number.isFinite(it.flowCostDeltaPct)).toBe(true);
      // A move is a move — proposing a no-op wastes the user's attention.
      expect(it.from.x !== it.to.x || it.from.y !== it.to.y).toBe(true);
    }
  });

  it("never proposes moving a pinned station", () => {
    const first = proposalFor()!.items[0].stationId;
    const pinned = { ...SAMPLE, stations: SAMPLE.stations.map((s) => (s.id === first ? { ...s, fixed: true } : s)) };
    const p = makePlacementProposal(pinned, buildRating(pinned));
    expect(p?.items.some((i) => i.stationId === first) ?? false).toBe(false);
  });

  it("returns null when there is nothing to propose", () => {
    const optimal = { ...SAMPLE, stations: buildRating(SAMPLE).optimized };
    expect(makePlacementProposal(optimal, buildRating(optimal))).toBeNull();
  });
});

describe("applyProposalItems — per-item accept (§4)", () => {
  it("moves only the accepted item and leaves the rest untouched", () => {
    const p = proposalFor()!;
    const [first, ...rest] = p.items;
    const out = applyProposalItems(SAMPLE, p.items, [first.stationId]);

    const moved = out.find((s) => s.id === first.stationId)!;
    expect({ x: moved.x, y: moved.y }).toEqual({ x: first.to.x, y: first.to.y });

    for (const it of rest) {
      const untouched = out.find((s) => s.id === it.stationId)!;
      expect({ x: untouched.x, y: untouched.y }).toEqual({ x: it.from.x, y: it.from.y });
    }
  });

  it("accepting nothing changes nothing", () => {
    const p = proposalFor()!;
    expect(applyProposalItems(SAMPLE, p.items, [])).toEqual(SAMPLE.stations);
  });

  it("refuses to move a pinned station even if its id is accepted", () => {
    const p = proposalFor()!;
    const target = p.items[0];
    const pinned = { ...SAMPLE, stations: SAMPLE.stations.map((s) => (s.id === target.stationId ? { ...s, fixed: true } : s)) };

    const out = applyProposalItems(pinned, p.items, [target.stationId]);
    const s = out.find((x) => x.id === target.stationId)!;
    expect({ x: s.x, y: s.y }).toEqual({ x: target.from.x, y: target.from.y });
  });
});

describe("staleness (§4 — mark, never silently drop)", () => {
  it("is not stale against the model it was computed from", () => {
    const p = proposalFor()!;
    expect(isProposalStale(p, SAMPLE)).toBe(false);
  });

  it("goes stale when the user edits underneath it", () => {
    const p = proposalFor()!;
    const edited = modelReducer(SAMPLE, { type: "MOVE_STATION", id: SAMPLE.stations[0].id, x: SAMPLE.stations[0].x + 1, y: SAMPLE.stations[0].y });
    expect(isProposalStale(p, edited)).toBe(true);
  });
});

describe("ACCEPT_PROPOSAL reducer action", () => {
  it("is the only path from solver to model, and it honours the subset", () => {
    const p = proposalFor()!;
    const one = p.items[0];
    const next = modelReducer(SAMPLE, { type: "ACCEPT_PROPOSAL", items: p.items, itemIds: [one.stationId] });

    const moved = next.stations.find((s) => s.id === one.stationId)!;
    expect({ x: moved.x, y: moved.y }).toEqual({ x: one.to.x, y: one.to.y });
    expect(next.stations.length).toBe(SAMPLE.stations.length);
  });

  it("ignores ids that are not in the proposal", () => {
    const items: ProposalItem[] = [];
    const next = modelReducer(SAMPLE, { type: "ACCEPT_PROPOSAL", items, itemIds: ["does-not-exist"] });
    expect(next.stations).toEqual(SAMPLE.stations);
  });
});
