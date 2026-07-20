import { useMemo } from "react";
import {
  Modal,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListBody,
  StructuredListRow,
  StructuredListCell,
  Tag,
} from "@carbon/react";
import type { Model } from "@flowplan/core/model/types";
import { buildRating, type Rating } from "@flowplan/core/engine/rating";
import { costAnalysis, type CostResult } from "@flowplan/core/engine/cost";
import type { ImprovedLayout } from "@flowplan/core/engine/improved";
import { TEAL, RED, TEXTD, scoreColor } from "./colors";

// One-click "Optimize layout" — the demo "wow" for a method engineer: press
// Optimize and see, side by side, what re-placing the stations saves. The
// optimiser (`improvedLayout`) only REPOSITIONS existing stations (same ids,
// same work content), so applying it is a normal, undoable edit through the
// reducer's APPLY_TEMPLATE / ACCEPT_PROPOSAL path — never a structural rewrite.
//
// The comparison is the honest before/after: flow cost and material travel come
// straight from the optimiser's own deltas; grade, output/shift and cost/part
// are re-derived by scoring the improved model with the same engine the Actual
// layout uses. Output/shift is cycle-gated, so repositioning leaves it
// unchanged — shown deliberately, because the savings come for free without
// touching work content. When nothing beats the current layout, Apply is
// disabled and the modal says so rather than inventing a change.

type Direction = "lower" | "higher";

interface Row {
  label: string;
  help: string;
  before: number;
  after: number;
  fmt: (n: number) => string;
  dir: Direction;
  /** Optional pre-computed display for the value cells (e.g. grade "A · 92"). */
  beforeText?: string;
  afterText?: string;
  /** Show Δ as absolute points (+N.N) rather than a percent — for scores. */
  deltaPoints?: boolean;
}

/** Percent change, signed; negative = the value went down. */
function pct(before: number, after: number): number {
  return before !== 0 ? +(((after - before) / before) * 100).toFixed(1) : 0;
}

function isBetter(before: number, after: number, dir: Direction): boolean {
  return dir === "lower" ? after < before : after > before;
}

export function OptimizeModal({
  open,
  onClose,
  onApply,
  model,
  improved,
  rating,
  cost,
}: {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  model: Model;
  improved: ImprovedLayout;
  rating: Rating;
  cost: CostResult;
}) {
  const improvedModel = useMemo(() => ({ ...model, stations: improved.stations }), [model, improved.stations]);
  const optRating = useMemo(() => (improved.better ? buildRating(improvedModel) : rating), [improvedModel, improved.better, rating]);
  const optCost = useMemo(() => (improved.better ? costAnalysis(improvedModel) : cost), [improvedModel, improved.better, cost]);

  const money = (n: number) => cost.currency + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (n: number) => Math.round(n).toLocaleString();

  const rows: Row[] = [
    {
      label: "Flow cost",
      help: "Total material transport work: Σ(volume × distance × transport factor).",
      before: improved.deltas.flowCostBefore,
      after: improved.deltas.flowCostAfter,
      fmt: num,
      dir: "lower",
    },
    {
      label: "Material travel",
      help: "Σ(volume × rectilinear distance) in cell·moves per shift.",
      before: improved.deltas.travelBefore,
      after: improved.deltas.travelAfter,
      fmt: num,
      dir: "lower",
    },
    {
      label: "Grade",
      help: "Weighted composite of the seven KPIs, scored by the same engine as the Actual layout.",
      before: rating.composite,
      after: optRating.composite,
      fmt: (n) => n.toFixed(0),
      dir: "higher",
      beforeText: `${rating.letter} · ${rating.composite.toFixed(0)}`,
      afterText: `${optRating.letter} · ${optRating.composite.toFixed(0)}`,
      deltaPoints: true,
    },
    {
      label: "Output / shift",
      help: "Line throughput per shift. Cycle-gated, so repositioning leaves it unchanged — the savings come without touching work content.",
      before: rating.balance.lineOut,
      after: optRating.balance.lineOut,
      fmt: (n) => n.toLocaleString(),
      dir: "higher",
    },
    {
      label: "Cost / part",
      help: "Operating cost per part; falls as reduced transport lowers opex.",
      before: cost.costPerPart,
      after: optCost.costPerPart,
      fmt: money,
      dir: "lower",
    },
  ];

  return (
    <Modal
      open={open}
      modalHeading="Optimize layout"
      modalLabel="Before / after"
      primaryButtonText="Apply optimized layout"
      secondaryButtonText={improved.better ? "Discard" : "Close"}
      primaryButtonDisabled={!improved.better}
      onRequestClose={onClose}
      onRequestSubmit={() => {
        onApply();
        onClose();
      }}
      size="md"
    >
      <div className="opt-modal">
        <div className="opt-modal__head">
          {improved.better ? (
            <Tag type="teal" size="md">
              {improved.strategy === "form" ? `${improved.form}-form cell` : `${improved.deltas.moved} station${improved.deltas.moved === 1 ? "" : "s"} moved`}
            </Tag>
          ) : (
            <Tag type="gray" size="md">Already optimal</Tag>
          )}
          <p className="opt-modal__rationale">{improved.rationale}</p>
        </div>

        <StructuredListWrapper aria-label="Before and after comparison" isCondensed>
          <StructuredListHead>
            <StructuredListRow head>
              <StructuredListCell head>Metric</StructuredListCell>
              <StructuredListCell head>Current</StructuredListCell>
              <StructuredListCell head>Optimized</StructuredListCell>
              <StructuredListCell head>Δ</StructuredListCell>
            </StructuredListRow>
          </StructuredListHead>
          <StructuredListBody>
            {rows.map((r) => {
              const changed = r.before !== r.after;
              const better = isBetter(r.before, r.after, r.dir);
              const deltaColor = !changed ? TEXTD : better ? TEAL : RED;
              const deltaText = !changed
                ? "—"
                : r.deltaPoints
                  ? `${r.after - r.before > 0 ? "+" : ""}${(r.after - r.before).toFixed(1)} pts`
                  : `${pct(r.before, r.after) > 0 ? "+" : ""}${pct(r.before, r.after)}%`;
              const afterColor = r.label === "Grade" ? scoreColor(r.after) : changed && better ? TEAL : undefined;
              return (
                <StructuredListRow key={r.label}>
                  <StructuredListCell>
                    <span title={r.help}>{r.label}</span>
                  </StructuredListCell>
                  <StructuredListCell>{r.beforeText ?? r.fmt(r.before)}</StructuredListCell>
                  <StructuredListCell>
                    <span style={{ color: afterColor, fontWeight: changed ? 600 : undefined }}>{r.afterText ?? r.fmt(r.after)}</span>
                  </StructuredListCell>
                  <StructuredListCell>
                    <span style={{ color: deltaColor }}>{deltaText}</span>
                  </StructuredListCell>
                </StructuredListRow>
              );
            })}
          </StructuredListBody>
        </StructuredListWrapper>

        <p className="opt-modal__note">
          {improved.better
            ? "Non-destructive — applying is a normal edit you can undo (Ctrl/Cmd+Z). Same stations, same work content; only their placement changes."
            : "No repositioning beats the current layout by a meaningful margin, so there is nothing to apply."}
        </p>
      </div>
    </Modal>
  );
}
