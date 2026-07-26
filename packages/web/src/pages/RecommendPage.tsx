import { useMemo, useState } from "react";
import { Tile } from "@carbon/react";
import {
  DEFAULT_PROGRAM_YEARS,
  generateCandidates,
  rankByDecision,
  type GenerateBrief,
} from "@flowplan/core/engine/generate";
import { FORM_LABELS } from "@flowplan/core/engine/templates";
import type { ConceptProfile } from "@flowplan/core/engine/concepts";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { DecisionWeightsApi } from "../store/decisionWeights";
import { PageHead } from "../components/PageHead";
import { Btn } from "../components/Btn";
import { Footnote, SectionLabel } from "../components/analysisKit";
import { NumberField } from "../components/formKit";
import { ConceptTable } from "../planner/ConceptTable";
import { DecisionWeightsEditor } from "../planner/DecisionWeights";
import { Crossover } from "../planner/Crossover";
import { Sensitivity } from "../planner/Sensitivity";
import { navigate } from "../store/useHashRoute";
import { num } from "../format";

/**
 * What concepts would suit the cell I already have?
 *
 * The concept comparison only existed as stage 2 of the planning flow, driven
 * by the parts matrix — so it was reachable exactly once, on the way past. If
 * you opened the sample, imported a model, or drew a cell by hand, there was no
 * way to ask "is this the right organisational form for this work at this
 * volume?" about the thing in front of you.
 *
 * This is that question, asked of the OPEN CELL. The routing comes off the
 * canvas rather than from a parts list: whatever process steps are on the
 * layout, at whatever cycles they currently carry, is the work content. Change
 * a cycle in the editor and the recommendation changes with it.
 *
 * It does not touch the layout. Taking a concept from here loads it as a new
 * cell beside the one you have, because replacing a layout somebody has been
 * editing is not a thing a page called "recommend" should do.
 */
export function RecommendPage({
  api,
  concepts,
  weightsApi,
}: {
  api: FlowPlanApi;
  concepts: ConceptProfile[];
  weightsApi: DecisionWeightsApi;
}) {
  const model = api.model;
  const process = model.stations.filter((s) => s.role === "process");

  // Seeded from the cell's own throughput so the page opens on a question that
  // is already about this cell, not on a blank number.
  const shiftHours = model.shiftHours ?? 8;
  const [annualShifts, setShifts] = useState(model.costConfig?.annualShifts ?? 460);
  const [programYears, setYears] = useState(DEFAULT_PROGRAM_YEARS);
  const [annualVolume, setVolume] = useState(() =>
    Math.max(1000, Math.round((api.rating.balance.lineOut || 500) * (model.costConfig?.annualShifts ?? 460))),
  );
  const [pickedId, setPicked] = useState<string | null>(null);
  const [showWeights, setShowWeights] = useState(false);

  const brief: GenerateBrief = useMemo(
    () => ({
      name: model.name,
      // The work content is what is on the canvas. A station carries its scrap
      // rate and its ergonomic risk too, so the sweep rebuilds against the real
      // step list rather than against names alone.
      steps: process.map((s) => ({
        name: s.name,
        cycleTimeSec: s.cycleTimeSec,
        type: s.type,
        ergoRisk: s.ergoRisk,
        scrapRate: s.scrapRate && s.scrapRate > 0 ? s.scrapRate : undefined,
      })),
      annualVolume,
      annualShifts,
      shiftHours,
      programYears,
      currency: model.costConfig?.currency,
      laborCostPerHour: model.costConfig?.laborCostPerHour,
      conceptCatalog: concepts,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, annualVolume, annualShifts, programYears, shiftHours, concepts],
  );

  const candidates = useMemo(
    () => (brief.steps.length ? rankByDecision(generateCandidates(brief), weightsApi.weights) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(brief), JSON.stringify(weightsApi.weights)],
  );
  const picked = candidates.find((c) => c.id === pickedId) ?? candidates[0] ?? null;

  if (process.length === 0) {
    return (
      <div className="page">
        <PageHead title="Concept recommendations" />
        <Tile className="lib-page__empty">
          <h2 className="lib-page__emptyTitle">This cell has no process steps</h2>
          <p>No work content to rank against.</p>
          <div className="lib-page__emptyActions">
            <Btn variant="primary" onClick={() => navigate("/")}>
              Back to the editor
            </Btn>
          </div>
        </Tile>
      </div>
    );
  }

  return (
    <div className="page rec">
      <PageHead
        title="Concept recommendations"
        actions={
          <Btn size="compact" variant="ghost" onClick={() => setShowWeights((v) => !v)}>
            {showWeights ? "Hide weights" : "Weights"}
          </Btn>
        }
      />

      <p className="planner__sub">
        {model.name} · {process.length} process step{process.length === 1 ? "" : "s"} ·{" "}
        {num(process.reduce((a, s) => a + s.cycleTimeSec, 0))}s work content
      </p>

      <SectionLabel>Demand</SectionLabel>
      <div className="rec__inputs">
        <NumberField
          id="rec-vol"
          label="Annual volume"
          value={annualVolume}
          min={1}
          helperText="From this cell's output"
          onChange={(v) => setVolume(Math.max(1, Number(v) || 1))}
        />
        <NumberField id="rec-shifts" label="Shifts per year" value={annualShifts} min={1} onChange={(v) => setShifts(Math.max(1, Number(v) || 1))} />
        <NumberField id="rec-years" label="Program years" value={programYears} min={1} onChange={(v) => setYears(Math.max(1, Number(v) || 1))} />
      </div>

      {showWeights ? <DecisionWeightsEditor api={weightsApi} /> : null}

      <ConceptTable candidates={candidates} selectedId={picked?.id ?? null} onSelect={setPicked} />

      {picked ? (
        <div className="rec__take">
          <Btn
            variant="primary"
            onClick={() => {
              api.addCell(picked.model, `${model.name} — ${picked.conceptLabel}`);
              navigate("/");
            }}
          >
            Open {picked.conceptLabel} ({FORM_LABELS[picked.form]}) as a new layout
          </Btn>
          <Footnote>Added as a new layout; the open cell is not modified.</Footnote>
        </div>
      ) : null}

      {model.conceptKind && picked && model.conceptKind !== picked.concept ? (
        <Footnote>
          This cell was generated as {model.conceptKind}; at {num(annualVolume)}/yr the ranking favours{" "}
          {picked.conceptLabel}.
        </Footnote>
      ) : null}

      <Crossover brief={brief} atVolume={annualVolume} currency={picked?.cost.currency ?? "$"} />
      <Sensitivity brief={brief} weights={weightsApi.weights} />
    </div>
  );
}
