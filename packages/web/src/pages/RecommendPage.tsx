import { useMemo, useState } from "react";
import {
  Button,
  NumberInput,
  Slider,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  Tile,
} from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import {
  DECISION_WEIGHTS,
  conceptCrossoverRanges,
  generateCandidates,
  rankByDecision,
  type GenerateBrief,
} from "@flowplan/core/engine/generate";
import { DEFAULT_PROGRAM_YEARS } from "@flowplan/core/engine/generate";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { DecisionWeightsApi } from "../store/decisionWeights";
import { navigate } from "../store/useHashRoute";

// What concept would suit the cell you already have? The routing comes off the
// canvas — whatever process steps are on the layout, at their current cycles —
// and the sweep ranks the concepts by a weighted, editable decision rather than
// cost alone. Taking a concept loads it as a NEW layout beside the open one; it
// never overwrites the cell you have been editing.

const money = (n: number, cur = "$") => cur + Math.round(n).toLocaleString();
const num = (n: number) => Math.round(n).toLocaleString();
const WEIGHT_LABELS: Record<keyof typeof DECISION_WEIGHTS, string> = {
  cost: "Cost / part",
  capex: "Capex",
  fit: "Volume fit",
  operators: "Operators",
  flexibility: "Flexibility",
};

export function RecommendPage({
  api,
  weightsApi,
}: {
  api: FlowPlanApi;
  weightsApi: DecisionWeightsApi;
}) {
  const model = api.model;
  const process = model.stations.filter((s) => s.role === "process");
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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, annualVolume, annualShifts, programYears, shiftHours],
  );

  const candidates = useMemo(
    () => (brief.steps.length ? rankByDecision(generateCandidates(brief), weightsApi.weights) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(brief), JSON.stringify(weightsApi.weights)],
  );
  const picked = candidates.find((c) => c.id === pickedId) ?? candidates[0] ?? null;
  const crossover = useMemo(
    () => (brief.steps.length ? conceptCrossoverRanges(brief) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(brief)],
  );

  if (process.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <Button size="sm" kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate("/")}>Editor</Button>
          <h1 className="page-title">Concept recommendations</h1>
        </div>
        <Tile className="lib-page__empty">
          <h2 className="lib-page__emptyTitle">This cell has no process steps</h2>
          <p>No work content to rank against.</p>
          <div style={{ marginTop: 12 }}>
            <Button onClick={() => navigate("/")}>Back to the editor</Button>
          </div>
        </Tile>
      </div>
    );
  }

  return (
    <div className="page rec">
      <div className="page-head">
        <Button size="sm" kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate("/")}>Editor</Button>
        <h1 className="page-title">Concept recommendations</h1>
        <Button size="sm" kind="ghost" style={{ marginLeft: "auto" }} onClick={() => setShowWeights((v) => !v)}>
          {showWeights ? "Hide weights" : "Weights"}
        </Button>
      </div>

      <p className="u-caption">
        {model.name} · {process.length} process step{process.length === 1 ? "" : "s"} ·{" "}
        {num(process.reduce((a, s) => a + s.cycleTimeSec, 0))}s work content
      </p>

      <h4 className="lib-page__section">Demand</h4>
      <div className="lib-page__grid">
        <NumberInput id="rec-vol" label="Annual volume" value={annualVolume} min={1} helperText="From this cell's output" onChange={(_e, { value }) => setVolume(Math.max(1, Number(value) || 1))} />
        <NumberInput id="rec-shifts" label="Shifts per year" value={annualShifts} min={1} onChange={(_e, { value }) => setShifts(Math.max(1, Number(value) || 1))} />
        <NumberInput id="rec-years" label="Program years" value={programYears} min={1} onChange={(_e, { value }) => setYears(Math.max(1, Number(value) || 1))} />
      </div>

      {showWeights ? (
        <Tile className="dw">
          <h4 className="lib-page__section">What "best" means</h4>
          {(Object.keys(DECISION_WEIGHTS) as Array<keyof typeof DECISION_WEIGHTS>).map((k) => (
            <Slider
              key={k}
              labelText={WEIGHT_LABELS[k]}
              min={0}
              max={100}
              step={5}
              value={Math.round(weightsApi.weights[k] * 100)}
              onChange={({ value }) => weightsApi.set(k, value / 100)}
            />
          ))}
          <Button size="sm" kind="ghost" onClick={weightsApi.reset} disabled={weightsApi.isDefault}>
            Reset weighting
          </Button>
        </Tile>
      ) : null}

      <h4 className="lib-page__section">Ranked concepts</h4>
      <StructuredListWrapper isCondensed selection>
        <StructuredListHead>
          <StructuredListRow head>
            <StructuredListCell head>Concept</StructuredListCell>
            <StructuredListCell head>Score</StructuredListCell>
            <StructuredListCell head>Loaded cost/part</StructuredListCell>
            <StructuredListCell head>Capex</StructuredListCell>
            <StructuredListCell head>Operators</StructuredListCell>
            <StructuredListCell head>Fit</StructuredListCell>
          </StructuredListRow>
        </StructuredListHead>
        <StructuredListBody>
          {candidates.map((c) => (
            <StructuredListRow key={c.id} onClick={() => setPicked(c.id)} className={c.id === picked?.id ? "rec__on" : undefined}>
              <StructuredListCell>
                {c.conceptLabel} <span className="u-caption">{c.form}</span>{" "}
                {c.metrics.meetsDemand ? null : <Tag type="red" size="sm">Misses demand</Tag>}
              </StructuredListCell>
              <StructuredListCell>{Math.round(c.metrics.decisionScore ?? 0)}</StructuredListCell>
              <StructuredListCell>{money(c.metrics.loadedCostPerPart, c.cost.currency)}</StructuredListCell>
              <StructuredListCell>{money(c.metrics.capexTotal, c.cost.currency)}</StructuredListCell>
              <StructuredListCell>{c.metrics.operators}</StructuredListCell>
              <StructuredListCell>{Math.round(c.metrics.conceptFit)}</StructuredListCell>
            </StructuredListRow>
          ))}
        </StructuredListBody>
      </StructuredListWrapper>

      {picked ? (
        <div className="rec__take">
          <Button
            onClick={() => {
              api.addCell(picked.model, `${model.name} — ${picked.conceptLabel}`);
              navigate("/");
            }}
          >
            Open {picked.conceptLabel} ({picked.form}) as a new layout
          </Button>
          <p className="u-caption">Added as a new layout; the open cell is not modified.</p>
        </div>
      ) : null}

      {crossover.length > 1 ? (
        <>
          <h4 className="lib-page__section">Where the best concept changes with volume</h4>
          <table className="rep__table">
            <thead>
              <tr><th>From (parts/yr)</th><th>Best concept</th><th className="rep__numCol">Lead</th></tr>
            </thead>
            <tbody>
              {crossover.map((seg, i) => (
                <tr key={i}>
                  <td>{num(seg.from)}{seg.to ? `–${num(seg.to)}` : "+"}</td>
                  <td>{seg.winnerLabel}</td>
                  <td className="rep__numCol">{seg.minMarginPct != null ? `${Math.round(seg.minMarginPct)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="u-caption">The winner and how far ahead it is of the next concept, across the volume sweep.</p>
        </>
      ) : null}
    </div>
  );
}
