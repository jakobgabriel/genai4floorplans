import { useMemo, useState } from "react";
import { NumberInput, Slider, Tag, Tile } from "@carbon/react";
import {
  DECISION_WEIGHTS,
  conceptCrossoverRanges,
  generateCandidates,
  rankByDecision,
  type GenerateBrief,
} from "@flowplan/core/engine/generate";
import { DEFAULT_PROGRAM_YEARS } from "@flowplan/core/engine/generate";
import { byKind } from "@flowplan/core/engine/concepts";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { DecisionWeightsApi } from "../store/decisionWeights";
import { useConcepts } from "../store/concepts";
import { navigate } from "../store/useHashRoute";
import { PageHead } from "../components/PageHead";
import { Btn } from "../components/Btn";
import { KpiTile, DashCard } from "../components/dashKit";
import { Footnote } from "../components/analysisKit";
import { scoreColor } from "../components/colors";

// What concept would suit the cell you already have? The routing comes off the
// canvas — whatever process steps are on the layout, at their current cycles —
// and the sweep ranks the concepts by a weighted, editable decision rather than
// cost alone. Taking a concept loads it as a NEW layout beside the open one; it
// never overwrites the cell you have been editing.
//
// It wears the same airy `.bi` dashboard language as the report and the
// analysis overview: a hero for the leading concept, a KPI band, and cards.

const money = (n: number, cur = "$") => cur + Math.round(n).toLocaleString();
const num = (n: number) => Math.round(n).toLocaleString();
const WEIGHT_LABELS: Record<keyof typeof DECISION_WEIGHTS, string> = {
  cost: "Cost / part",
  capex: "Capex",
  fit: "Volume fit",
  operators: "Operators",
  flexibility: "Flexibility",
};

export function RecommendPage({ api, weightsApi }: { api: FlowPlanApi; weightsApi: DecisionWeightsApi }) {
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
  // Rank against the catalog the user edits on the Concepts page, not the
  // shipped defaults — the same catalog the guided planner ranks with.
  const conceptApi = useConcepts();
  const catalog = useMemo(() => byKind(conceptApi.concepts), [conceptApi.concepts]);

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
      catalog,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, annualVolume, annualShifts, programYears, shiftHours, catalog],
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
      <div className="page bi">
        <PageHead title="Concept recommendations" />
        <Tile className="bi-card bi-card--wide rep__empty">
          <h2 className="rep__emptyTitle">This cell has no process steps</h2>
          <p>No work content to rank against.</p>
          <Btn variant="primary" onClick={() => navigate("/")}>
            Back to the editor
          </Btn>
        </Tile>
      </div>
    );
  }

  const cur = model.costConfig?.currency ?? "$";

  return (
    <div className="page bi">
      <PageHead
        title="Concept recommendations"
        actions={
          <Btn variant="ghost" size="compact" onClick={() => setShowWeights((v) => !v)}>
            {showWeights ? "Hide weights" : "Weights"}
          </Btn>
        }
      />

      {/* ── the leading concept as the hero, its metrics across the band ── */}
      {picked ? (
        <div className="bi__topbar rep__topbar">
          <Tile className="bi-hero">
            <div className="bi-hero__lab">Recommended</div>
            <div className="bi-hero__grade" style={{ fontSize: "2rem", color: scoreColor(picked.metrics.decisionScore ?? 0) }}>
              {picked.conceptLabel}
            </div>
            <div className="bi-hero__score">
              {Math.round(picked.metrics.decisionScore ?? 0)}
              <span> / 100 · {picked.form}-form</span>
            </div>
            <div className="bi-hero__sub">
              {model.name} · {process.length} step{process.length === 1 ? "" : "s"} ·{" "}
              {num(process.reduce((a, s) => a + s.cycleTimeSec, 0))}s work content
            </div>
          </Tile>
          <div className="bi-kpis">
            <KpiTile label="Loaded cost / part" value={money(picked.metrics.loadedCostPerPart, cur)} sub="incl. amortised capex" />
            <KpiTile label="Capex" value={money(picked.metrics.capexTotal, cur)} />
            <KpiTile label="Operators" value={picked.metrics.operators} />
            <KpiTile label="Output" value={num(picked.metrics.lineOut)} sub="/shift" />
            <KpiTile label="Volume fit" value={Math.round(picked.metrics.conceptFit)} color={scoreColor(picked.metrics.conceptFit)} />
          </div>
        </div>
      ) : null}

      <DashCard
        title="Demand"
        help="The routing is fixed by the cell's process steps; these set the volume the concepts are ranked against."
        actions={
          picked ? (
            <Btn
              variant="primary"
              size="compact"
              onClick={() => {
                api.addCell(picked.model, `${model.name} — ${picked.conceptLabel}`);
                navigate("/");
              }}
            >
              Open {picked.conceptLabel} ({picked.form}) as a new layout
            </Btn>
          ) : undefined
        }
      >
        <div className="bi-tiles">
          <div className="rec__field">
            <NumberInput id="rec-vol" label="Annual volume" value={annualVolume} min={1} helperText="From this cell's output" onChange={(_e, { value }) => setVolume(Math.max(1, Number(value) || 1))} />
          </div>
          <div className="rec__field">
            <NumberInput id="rec-shifts" label="Shifts per year" value={annualShifts} min={1} onChange={(_e, { value }) => setShifts(Math.max(1, Number(value) || 1))} />
          </div>
          <div className="rec__field">
            <NumberInput id="rec-years" label="Program years" value={programYears} min={1} onChange={(_e, { value }) => setYears(Math.max(1, Number(value) || 1))} />
          </div>
        </div>
        {picked ? <Footnote>Taking a concept opens it as a new layout beside the current cell — the open cell is not modified.</Footnote> : null}
      </DashCard>

      {showWeights ? (
        <DashCard
          title="What “best” means"
          help="The weighted decision behind the ranking. Raise a criterion to let it drive the winner."
          actions={
            <Btn variant="ghost" size="compact" onClick={weightsApi.reset} disabled={weightsApi.isDefault}>
              Reset weighting
            </Btn>
          }
        >
          <div className="rec__weights">
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
          </div>
        </DashCard>
      ) : null}

      <DashCard title="Ranked concepts" lead="Every concept × form, scored by the weighted decision. Click a row to inspect it.">
        <div className="rep__scroll">
          <table className="bi-tbl">
            <thead>
              <tr>
                <th>Concept</th>
                <th>Form</th>
                <th className="bi-tbl__num">Score</th>
                <th className="bi-tbl__num">Loaded / part</th>
                <th className="bi-tbl__num">Capex</th>
                <th className="bi-tbl__num">Ops</th>
                <th className="bi-tbl__num">Fit</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setPicked(c.id)}
                  className={c.id === picked?.id ? "bi-tbl__pick bi-tbl__click" : "bi-tbl__click"}
                >
                  <td>
                    {c.conceptLabel}
                    {c.id === picked?.id ? (
                      <Tag type="green" size="sm">
                        top
                      </Tag>
                    ) : null}
                    {c.metrics.meetsDemand ? null : (
                      <Tag type="red" size="sm">
                        misses demand
                      </Tag>
                    )}
                  </td>
                  <td>{c.form}</td>
                  <td className="bi-tbl__num">{Math.round(c.metrics.decisionScore ?? 0)}</td>
                  <td className="bi-tbl__num">{money(c.metrics.loadedCostPerPart, c.cost.currency)}</td>
                  <td className="bi-tbl__num">{money(c.metrics.capexTotal, c.cost.currency)}</td>
                  <td className="bi-tbl__num">{c.metrics.operators}</td>
                  <td className="bi-tbl__num">{Math.round(c.metrics.conceptFit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashCard>

      {crossover.length > 1 ? (
        <DashCard
          title="Where the best concept changes with volume"
          lead="The winner and how far ahead it is of the next concept, across the volume sweep."
        >
          <div className="rep__scroll">
            <table className="bi-tbl">
              <thead>
                <tr>
                  <th>From (parts/yr)</th>
                  <th>Best concept</th>
                  <th className="bi-tbl__num">Lead</th>
                </tr>
              </thead>
              <tbody>
                {crossover.map((seg, i) => (
                  <tr key={i}>
                    <td>
                      {num(seg.from)}
                      {seg.to ? `–${num(seg.to)}` : "+"}
                    </td>
                    <td>{seg.winnerLabel}</td>
                    <td className="bi-tbl__num">{seg.minMarginPct != null ? `${Math.round(seg.minMarginPct)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      ) : null}
    </div>
  );
}
