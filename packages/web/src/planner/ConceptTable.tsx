import {
  ClickableTile,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
} from "@carbon/react";
import type { Candidate } from "@flowplan/core/engine/generate";

// Ranked concept comparison. One row per option, selectable. Deliberately
// column-light: the planner is choosing a concept, not auditing a model, so
// only the numbers that change the decision are shown.

import { money, moneyWhole, num } from "../format";

// Featured quick-preview cards (LCG spike): four pre-selected jump-to-variant
// entry points above the detail table, each the best candidate on one axis.
function bestBy(pool: Candidate[], score: (c: Candidate) => number): Candidate | null {
  return pool.reduce<Candidate | null>((best, c) => (best == null || score(c) > score(best) ? c : best), null);
}

function FeaturedCards({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const meet = candidates.filter((c) => c.metrics.meetsDemand);
  const pool = meet.length ? meet : candidates;
  const cur = candidates[0].cost.currency;
  const cards = [
    { key: "balanced", label: "Balanced", sub: "best overall score", c: bestBy(pool, (c) => c.metrics.composite), val: (c: Candidate) => `${c.metrics.composite.toFixed(0)}/100` },
    { key: "smallest", label: "Smallest footprint", sub: "fewest stations", c: bestBy(pool, (c) => -c.metrics.stations), val: (c: Candidate) => `${c.metrics.stations} steps` },
    { key: "throughput", label: "Highest throughput", sub: "most output/shift", c: bestBy(pool, (c) => c.metrics.lineOut), val: (c: Candidate) => `${num(c.metrics.lineOut)}/sh` },
    { key: "tco", label: "Lowest TCO", sub: "loaded cost/part", c: bestBy(pool, (c) => -c.metrics.loadedCostPerPart), val: (c: Candidate) => money(cur, c.metrics.loadedCostPerPart) },
  ].filter((f) => f.c);

  return (
    <div className="featured-cards">
      {cards.map((f) => {
        const c = f.c!;
        return (
          <ClickableTile
            key={f.key}
            className={"featured-card" + (c.id === selectedId ? " featured-card--on" : "")}
            onClick={() => onSelect(c.id)}
          >
            <div className="featured-card__label">{f.label}</div>
            <div className="featured-card__val">{f.val(c)}</div>
            <div className="featured-card__sub">{c.conceptLabel} · {c.form}-form</div>
            <div className="featured-card__hint">{f.sub}</div>
          </ClickableTile>
        );
      })}
    </div>
  );
}

export function ConceptTable({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (candidates.length === 0) return <p className="planner__sub">No options — check the step list.</p>;
  const cur = candidates[0].cost.currency;

  return (
    <>
    <FeaturedCards candidates={candidates} selectedId={selectedId} onSelect={onSelect} />
    <StructuredListWrapper selection ariaLabel="Manufacturing concepts" className="planner__table">
      <StructuredListHead>
        <StructuredListRow head>
          <StructuredListCell head>Concept</StructuredListCell>
          <StructuredListCell head>Cost / part</StructuredListCell>
          <StructuredListCell head>Capex</StructuredListCell>
          <StructuredListCell head>Operators</StructuredListCell>
          <StructuredListCell head>Output</StructuredListCell>
          <StructuredListCell head>Notes</StructuredListCell>
        </StructuredListRow>
      </StructuredListHead>
      <StructuredListBody>
        {candidates.map((c) => {
          const m = c.metrics;
          const selected = c.id === selectedId;
          return (
            <StructuredListRow
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={selected ? "planner__row--on" : undefined}
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(c.id);
                }
              }}
            >
              <StructuredListCell>
                <b>{c.conceptLabel}</b>
                <div className="planner__cellSub">{c.form}-form · {m.stations} steps · {m.parallelUnits} units</div>
              </StructuredListCell>
              <StructuredListCell>
                <b>{money(cur, m.loadedCostPerPart)}</b>
                <div className="planner__cellSub">
                  {money(cur, m.costPerPart)} run + {money(cur, m.capexPerPart)} capex
                </div>
              </StructuredListCell>
              <StructuredListCell>{moneyWhole(cur, m.capexTotal)}</StructuredListCell>
              <StructuredListCell>{m.operators}</StructuredListCell>
              <StructuredListCell>
                {num(m.lineOut)}
                <div className="planner__cellSub">/shift</div>
              </StructuredListCell>
              <StructuredListCell>
                <div className="planner__tags">
                  {!m.meetsDemand ? <Tag type="red" size="sm">Misses demand</Tag> : null}
                  {m.conceptFit < 40 ? <Tag type="magenta" size="sm">Off-volume</Tag> : null}
                  {m.overCapacityPct >= 25 ? <Tag type="teal" size="sm">+{m.overCapacityPct}% capacity</Tag> : null}
                </div>
              </StructuredListCell>
            </StructuredListRow>
          );
        })}
      </StructuredListBody>
    </StructuredListWrapper>
    </>
  );
}
