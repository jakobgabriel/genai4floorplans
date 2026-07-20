import type { Model } from "@flowplan/core/model/types";
import { isProposalStale, type PlacementProposal } from "@flowplan/core/engine/proposal";
import { AMBER, TEAL, TEALD, TEXT, TEXTD } from "./colors";

// Spec §4 — proposals are accepted per-item or wholesale, always explicitly.
//
// The per-item half lives ON THE CANVAS: each amber ghost is its own accept
// target, with its rationale on hover. That is Law 1 (confirmation by clicking
// the thing itself) and Law 5 (the spatial view is primary — numbers annotate
// the canvas, the canvas is not a supplement to a table).
//
// This strip is only the wholesale half plus a summary. An earlier version of
// this file was a checkbox table beside the canvas, which inverted both laws:
// it put the decision in the rail and left the ghosts inert decoration.

export interface ProposalPanelProps {
  proposal: PlacementProposal;
  model: Model;
  onAcceptAll: () => void;
  onDismiss: () => void;
}

export function ProposalPanel({ proposal, model, onAcceptAll, onDismiss }: ProposalPanelProps) {
  const stale = isProposalStale(proposal, model);
  const n = proposal.items.length;
  const pct = proposal.flowCostDeltaPct;

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 11.5 }}>
      <span style={{ color: TEXT }}>
        {n} move{n === 1 ? "" : "s"} proposed
      </span>
      <span style={{ color: pct < 0 ? TEAL : TEXTD }}>
        {pct < 0 ? `${pct.toFixed(1)}%` : `+${pct.toFixed(1)}%`} flow cost if all accepted
      </span>
      <span style={{ color: TEXTD }}>· click a dashed ghost to accept just that one</span>

      {stale ? (
        <span style={{ color: AMBER, border: `1px solid ${AMBER}`, borderRadius: 3, padding: "1px 6px", fontSize: 10.5 }}>
          stale — layout changed since this was computed
        </span>
      ) : null}

      <button className="btn sm" style={{ borderColor: TEALD, color: TEAL }} onClick={onAcceptAll}>
        Accept all {n}
      </button>
      <button className="btn sm" style={{ color: TEXTD }} onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
