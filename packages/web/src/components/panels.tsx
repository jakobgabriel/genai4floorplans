import { useMemo, useRef, useState } from "react";
import {
  Button,
  ClickableTile,
  InlineNotification,
  OperationalTag,
  ProgressBar,
  SelectItem,
  Slider,
  Stack,
  Tag,
  Tile,
  Toggle,
} from "@carbon/react";
import { Add, Catalog, CheckmarkFilled, ChevronDown, ChevronRight, Copy, Draw, TrashCan } from "@carbon/icons-react";
import { EmptyState, Footnote, KpiMeter, MetricTile, SectionLabel, ShareBar, scoreTag } from "./analysisKit";
import { FieldRow, NumberField, SelectField, TextAreaField, TextField } from "./formKit";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { cloneStation, makeStation } from "@flowplan/core/store/reducer";
import { AUTO, CYCLE_KEYS, ERGO, MERGE_MODES, ROLES, SIDES, SPLIT_MODES, STATION_TYPES, TRANSPORT, type CycleBreakdown, type Flow, type RatingWeights, type Side, type Station } from "@flowplan/core/model/types";
import { WEIGHTS, normalizeWeights } from "@flowplan/core/engine/rating";
import { bottleneckAdvice } from "@flowplan/core/engine/balance";
import { CYCLE_LABELS, cycleAdvice, cycleAnalysis, seedBreakdown } from "@flowplan/core/engine/cycle";
import { findImprovements, type Improvement } from "@flowplan/core/engine/improve";
import { yieldAnalysis } from "@flowplan/core/engine/yield";
import { stationCells } from "@flowplan/core/engine/geometry";
import { autoPotential } from "@flowplan/core/engine/automation";
import { YamazumiChart } from "./charts";
import { useAccents } from "./colors";
import { useToast } from "./ui";
import { useT } from "../i18n";
import type { CanvasMode } from "./LayoutCanvas";
import { LibraryPicker } from "./LibraryPicker";
import type { LibraryApi } from "../store/library";
import type { LibraryProcess } from "@flowplan/core/model/library";

// "analysis" is the whole readout — verdict, flow, balance, yield, automation
// and cost read as one page rather than five sibling tabs.
export type Tab = "analysis" | "flow" | "inspect" | "chat" | "schema" | "workload";

export interface PanelProps {
  api: FlowPlanApi;
  selId: string | null;
  setSel: (id: string | null) => void;
  setTab: (t: Tab) => void;
  setView: (v: "actual" | "improved" | "split") => void;
  mode: CanvasMode;
  setMode: (m: CanvasMode) => void;
  /** The process library, for adding a step from it. */
  lib?: LibraryApi;
  /** Place a library process on the canvas. */
  onAddProcess?: (p: LibraryProcess) => void;
}

/**
 * Adding a step, the two ways round.
 *
 * "Add process step" used to be one button handing back `makeStation` — "New
 * Step", machine, 30s, one operator — so the first thing anyone did after
 * adding a step was retype every field. Picking from the library is the
 * default now; the blank step stays for work the library has no entry for.
 *
 * The picker opens inline rather than sending you to another surface: you are
 * mid-edit, and a step you place has to land on the canvas you are looking at.
 */
export function AddStepButtons({ api, setSel, setTab, lib, onAddProcess }: Pick<PanelProps, "api" | "setSel" | "setTab" | "lib" | "onAddProcess">) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const blank = () => {
    const ns = makeStation(api.model);
    api.commit({ type: "ADD_STATION", station: ns });
    setSel(ns.id);
    setTab("inspect");
  };
  const canPick = !!lib && !!onAddProcess;
  return (
    <Stack gap={3}>
      <div className="pnl-addstep">
        {canPick ? (
          <Button kind="secondary" size="sm" renderIcon={Catalog} onClick={() => setPicking((v) => !v)}>
            {picking ? t("editor.addStep.closeLibrary") : t("editor.addStep.fromLibrary")}
          </Button>
        ) : null}
        <Button kind={canPick ? "ghost" : "secondary"} size="sm" renderIcon={Add} onClick={blank}>
          {t("editor.addStep.blank")}
        </Button>
      </div>
      {picking && lib && onAddProcess ? (
        <div className="pnl-picker">
          <LibraryPicker lib={lib} onPick={onAddProcess} actionLabel={t("editor.addStep.addToCell")} />
        </div>
      ) : null}
    </Stack>
  );
}

const KPI_HELP: Record<string, string> = {
  "Material flow cost": "Σ(volume × rectilinear distance × unitCost), scored against the optimizer's achievable floor.",
  "Total travel effort": "Σ(volume × distance) vs floor. Distance is Manhattan between station centers.",
  "Aisle congestion": "Proxy only: volume·distance for flows crossing the cell's centerline — not a full aisle-network model.",
  "Placement efficiency": "Actual flow cost vs the optimal floor for the same stations.",
  "Line balance": "Line output ÷ mean step rate. Operators are treated as simple parallelism — a simplification.",
  Ergonomics: "100 − the volume-weighted share of high-risk handling at process steps.",
  "Automation coherence": "100 − (auto-islands ÷ links). An auto-island is two automated steps joined by a manual handoff.",
};

/** Process steps in the cell. Every readout below is derived from these. */
export function stepCount(api: FlowPlanApi): number {
  return api.model.stations.filter((s) => s.role === "process").length;
}

/**
 * The readout tabs' empty state, plus the action that resolves it.
 *
 * An empty cell scores 100/100 grade A on Rating, 100/100 balance, 100% rolled
 * yield and $0 per part — not because the plan is good but because there is no
 * plan. Every readout tab therefore checks `stepCount` first and renders this
 * instead of a fabricated verdict.
 */
export function NoSteps({
  reads,
  api,
  setSel,
  setTab,
}: {
  reads: string;
  api: FlowPlanApi;
  setSel: (id: string | null) => void;
  setTab: (t: Tab) => void;
}) {
  return (
    <div className="pad ak-panel">
      <EmptyState
        title="No process steps"
        body={<>Nothing to report for {reads}. Add a step to populate this view.</>}
        action={
          <Button
            size="sm"
            renderIcon={Add}
            onClick={() => {
              const ns = makeStation(api.model);
              api.commit({ type: "ADD_STATION", station: ns });
              setSel(ns.id);
              setTab("inspect");
            }}
          >
            Add the first process step
          </Button>
        }
      />
    </div>
  );
}

/** Stage 1 of the analysis path: the grade, what drove it, and what would move it. */
export function VerdictSection({ api, setView, setSel, setTab }: PanelProps) {
  const r = api.rating;
  const kpis: Array<[string, number | null, number]> = [
    ["Material flow cost", r.actual.flowCost, r.scores.flowCost],
    ["Total travel effort", r.actual.travel, r.scores.travel],
    ["Aisle congestion", r.actual.congestion, r.scores.congestion],
    ["Placement efficiency", null, r.scores.placement],
    ["Line balance", null, r.scores.balance],
    ["Ergonomics", null, r.scores.ergo],
    ["Automation coherence", null, r.scores.auto],
  ];
  return (
    <Stack gap={6}>
      <Tile className="ak-metric">
        <div className="ak-metric__label">Actual-state rating</div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-05)" }}>
          <span className="ak-metric__value">
            {r.composite.toFixed(0)}
            <span className="ak-metric__unit">/100</span>
          </span>
          <Tag type={scoreTag(r.composite)} size="lg">
            Grade {r.letter}
          </Tag>
        </div>
      </Tile>

      <Stack gap={4}>
        {kpis.map(([lbl, val, sc]) => (
          <KpiMeter key={lbl} label={lbl} score={sc} raw={val != null ? val.toFixed(0) : undefined} help={KPI_HELP[lbl]} />
        ))}
      </Stack>

      <ImprovementList api={api} setSel={setSel} setTab={setTab} setView={setView} />
    </Stack>
  );
}

/** Stage 2: where the material cost actually comes from, and how it is weighted. */
export function FlowCostSection({ api }: { api: FlowPlanApi }) {
  const r = api.rating;
  return (
    <Stack gap={6}>
      <Stack gap={4}>
        <SectionLabel>Where the cost sits</SectionLabel>
        {r.pareto.length === 0 ? (
          <Footnote>No material flows drawn.</Footnote>
        ) : (
          <Stack gap={3}>
            {r.pareto.slice(0, 5).map((p, i) => (
              <ShareBar
                key={i}
                label={p.from + " → " + p.to}
                value={p.share}
                figure={p.share.toFixed(0) + "%"}
                emphasis={
                  i === 0 ? (
                    <Tag type="red" size="sm">
                      biggest
                    </Tag>
                  ) : undefined
                }
              />
            ))}
          </Stack>
        )}
      </Stack>

      <WeightsEditor api={api} />
    </Stack>
  );
}


/**
 * Ranked improvement opportunities.
 *
 * Replaces the old single "improvement potential" number, which only measured
 * position swaps. A generated cell is already placed in flow order, so that
 * number was always 0% — which read as "nothing can be improved" when it meant
 * "this one optimiser has nothing to do". This shows every axis instead.
 */
function ImprovementList({
  api,
  setSel,
  setTab,
  setView,
}: {
  api: FlowPlanApi;
  setSel: (id: string | null) => void;
  setTab: (t: Tab) => void;
  setView: (v: "actual" | "improved" | "split") => void;
}) {
  const report = useMemo(() => findImprovements(api.model), [api.model]);

  return (
    <Stack gap={4}>
      <SectionLabel help="Ranked across every axis the engine can see: line balance, the constraint, waste content, station positions and cell form. Throughput gains outrank labour gains, which outrank shorter travel.">
        What could be better
      </SectionLabel>

      {report.exhausted ? (
        <InlineNotification
          kind="success"
          lowContrast
          hideCloseButton
          title="No headroom found"
          subtitle={report.why}
        />
      ) : (
        <Stack gap={3}>
          {report.improvements.slice(0, 6).map((imp: Improvement, i: number) => {
            const clickable = imp.kind === "relayout" || imp.targetIds.length > 0;
            const open = () => {
              if (imp.kind === "relayout") setView("improved");
              else if (imp.targetIds[0]) {
                setSel(imp.targetIds[0]);
                setTab("inspect");
              }
            };
            const body = (
              <>
                <div className="ak-imp__head">
                  <strong className="ak-imp__title">{imp.title}</strong>
                  <Tag type="gray" size="sm">
                    {imp.confidence}
                  </Tag>
                </div>
                <div className="ak-row__sub">{imp.detail}</div>
              </>
            );
            return clickable ? (
              <ClickableTile key={imp.kind + i} className="ak-row" onClick={open}>
                {body}
              </ClickableTile>
            ) : (
              <Tile key={imp.kind + i} className="ak-row">
                {body}
              </Tile>
            );
          })}
        </Stack>
      )}

      <Footnote>
        Balance loss {report.balanceLossPct}% · takt {report.taktSec}s · {report.lineOut.toLocaleString("en-US")}/shift
      </Footnote>
    </Stack>
  );
}

const WEIGHT_LABELS: Array<[keyof RatingWeights, string]> = [
  ["flowCost", "Material flow cost"],
  ["travel", "Travel effort"],
  ["congestion", "Aisle congestion"],
  ["placement", "Placement efficiency"],
  ["balance", "Line balance"],
  ["ergo", "Ergonomics"],
  ["auto", "Automation coherence"],
];

function WeightsEditor({ api }: { api: FlowPlanApi }) {
  const [open, setOpen] = useState(false);
  const custom = !!api.model.weights;
  const w = normalizeWeights(api.model.weights ?? WEIGHTS);
  // One undo entry per drag: checkpoint once when a drag starts, stream updates
  // live, then finalise on release (mirrors the canvas drag pattern).
  const dragging = useRef(false);
  const setWeight = (key: keyof RatingWeights, value: number, live: boolean) => {
    if (live) {
      if (!dragging.current) {
        api.checkpoint();
        dragging.current = true;
      }
      api.live({ type: "SET_WEIGHTS", weights: { ...w, [key]: value } });
    } else {
      dragging.current = false;
      api.commit({ type: "SET_WEIGHTS", weights: { ...w, [key]: value } });
    }
  };
  return (
    <Stack gap={3}>
      <Button
        kind="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        renderIcon={open ? ChevronDown : ChevronRight}
      >
        Adjust KPI weights{custom ? " (custom)" : ""}
      </Button>
      {open ? (
        <Stack gap={5}>
          <Footnote>
            Normalised to 100%. The grade updates live.
          </Footnote>
          {WEIGHT_LABELS.map(([key, label]) => (
            <Slider
              key={key}
              labelText={`${label} — ${(w[key] * 100).toFixed(0)}%`}
              hideTextInput
              min={0}
              max={0.5}
              step={0.01}
              value={w[key]}
              onChange={({ value }) => setWeight(key, value, true)}
              onRelease={({ value }) => setWeight(key, value, false)}
            />
          ))}
          {custom ? (
            <Button kind="tertiary" size="sm" onClick={() => api.commit({ type: "SET_WEIGHTS", weights: undefined })}>
              Reset to defaults
            </Button>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

/** Stage 3: what caps the line, and what the cycle time is spent on. */
export function BalanceSection({ api, setSel, setTab }: { api: FlowPlanApi; setSel: (id: string | null) => void; setTab: (t: Tab) => void }) {
  const bal = api.rating.balance;
  const advice = bottleneckAdvice(bal, api.model.stations);
  const maxRate = bal.maxRate || 1;
  const bottleneck = bal.bottleneck;
  return (
      <Stack gap={6}>
        <MetricTile
          label="Line output (constrained by bottleneck)"
          value={bal.lineOut.toLocaleString()}
          unit="parts/shift"
          sub={`Takt ≈ ${bal.takt} s/part · balance score ${bal.score}/100`}
        />

        {advice.length > 0 ? (
          <Stack gap={3}>
            <InlineNotification kind="warning" lowContrast hideCloseButton title="How to lift the constraint">
              <ul className="ak-adviceList">
                {advice.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </InlineNotification>
            {bottleneck ? (
              <Button kind="ghost" size="sm" onClick={() => { setSel(bottleneck.id); setTab("inspect"); }}>
                View bottleneck
              </Button>
            ) : null}
          </Stack>
        ) : null}

        <Stack gap={4}>
          <SectionLabel>Throughput per step (util % vs line)</SectionLabel>
          <Stack gap={3}>
            {bal.steps.map((x) => {
              const isBn = bottleneck && x.id === bottleneck.id;
              // A mixed cell is sized for its heaviest part but runs the mix.
              // Where those differ, say so on the step rather than letting the
              // reader assume the one number covers both.
              const overSized = x.sizedCycle > x.cycle + 0.05;
              return (
                <ShareBar
                  key={x.id}
                  label={x.name}
                  value={Math.round((x.rate / maxRate) * 100)}
                  figure={x.rate.toLocaleString() + "/sh · " + x.util + "%"}
                  emphasis={
                    isBn ? (
                      <Tag type="red" size="sm">
                        bottleneck
                      </Tag>
                    ) : undefined
                  }
                  // Under the bar rather than beside the name: the rail is
                  // narrow, and a second tag on the head line crushed it.
                  sub={overSized ? `runs at ${x.cycle}s · sized for ${x.sizedCycle}s` : undefined}
                />
              );
            })}
          </Stack>
          <Footnote>
            Rate = min(3600/cycle × shift-hours × operators, capacity/shift) × parallel units. Low-util
            steps are starved by the bottleneck — that's spare capacity, not a problem to fix.
          </Footnote>
          {bal.steps.some((x) => x.sizedCycle > x.cycle + 0.05) ? (
            <Footnote>
              Rates are the mix average. Stations are sized for the heaviest part they see, so the worst-case
              cycle is higher than the one the cell runs at — that gap is the headroom the mix buys.
            </Footnote>
          ) : null}
        </Stack>

        <CycleSection api={api} setSel={setSel} setTab={setTab} />
        <ParallelSection api={api} setSel={setSel} setTab={setTab} />
      </Stack>
  );
}

// Value-add vs waste. Only meaningful once at least one step is decomposed, so
// the section leads with a prompt rather than an empty chart.
function CycleSection({ api, setSel, setTab }: { api: FlowPlanApi; setSel: (id: string | null) => void; setTab: (t: Tab) => void }) {
  const { CYCLE_COL } = useAccents();
  const takt = api.rating.balance.takt;
  const analysis = cycleAnalysis(api.model.stations, takt);
  const tips = cycleAdvice(analysis);
  if (analysis.totalCount === 0) return null;

  const open = (id: string) => {
    setSel(id);
    setTab("inspect");
  };

  return (
    <Stack gap={4}>
      <SectionLabel help="Cycle time split into value-add plus four waste classes. Only decomposed steps count toward the line ratio — undecomposed steps show hatched and are excluded.">
        Value add vs waste
      </SectionLabel>

      {analysis.decomposedCount === 0 ? (
        <Footnote>
          No step has a cycle breakdown yet. Select a step → Inspect → <b>Decompose</b> to split its
          cycle into value-add, handling, walk, wait and setup. The line ratio and waste backlog
          appear once at least one step is split.
        </Footnote>
      ) : (
        <Stack gap={4}>
          <MetricTile
            label={`Value-add ratio${analysis.complete ? "" : " (decomposed steps only)"}`}
            value={analysis.lineValueAddPct}
            unit="%"
            sub={`${analysis.lineValueAddSec}s value-add · ${analysis.lineNonValueAddSec}s waste · ${analysis.decomposedCount}/${analysis.totalCount} steps split`}
          />

          <YamazumiChart rows={analysis.stations} takt={takt} onSelect={open} />

          <div className="legend">
            {CYCLE_KEYS.map((k) => (
              <span key={k} className="u-row">
                <span className="ak-swatch" style={{ background: CYCLE_COL[k] }} />
                {CYCLE_LABELS[k]}
              </span>
            ))}
          </div>

          {tips.length > 0 ? (
            <InlineNotification kind="warning" lowContrast hideCloseButton title="Where the waste is">
              <ul className="ak-adviceList">
                {tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </InlineNotification>
          ) : null}

          {analysis.waste.length > 0 ? (
            <Stack gap={3}>
              <SectionLabel>Waste backlog (largest first)</SectionLabel>
              {analysis.waste.slice(0, 6).map((wst, i) => (
                <ShareBar
                  key={wst.stationId + wst.key + i}
                  label={wst.stationName}
                  value={wst.sharePct}
                  figure={`${wst.sec}s · ${wst.sharePct}%`}
                  emphasis={
                    <Tag type="gray" size="sm">
                      {wst.label.toLowerCase()}
                    </Tag>
                  }
                  onClick={() => open(wst.stationId)}
                />
              ))}
            </Stack>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}

function ParallelSection({ api, setSel, setTab }: { api: FlowPlanApi; setSel: (id: string | null) => void; setTab: (t: Tab) => void }) {
  const bal = api.rating.balance;
  const byId: Record<string, string> = {};
  api.model.stations.forEach((s) => (byId[s.id] = s.name));
  const path = bal.criticalPath.filter((id) => byId[id]);
  return (
    <Stack gap={4}>
      <SectionLabel help="The longest cumulative-cycle route — the sequence that sets the line's pace.">
        Critical path
      </SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-02)", alignItems: "center" }}>
        {path.length === 0 ? (
          <Footnote>—</Footnote>
        ) : (
          path.map((id, i) => (
            <span key={id} className="u-row">
              <OperationalTag type="blue" size="sm" text={byId[id]} onClick={() => { setSel(id); setTab("inspect"); }} />
              {i < path.length - 1 ? <span style={{ color: "var(--cds-text-secondary)" }}>→</span> : null}
            </span>
          ))
        )}
      </div>

      {bal.syncWaits.length > 0 ? (
        <Stack gap={3}>
          <SectionLabel>Merge synchronization</SectionLabel>
          {bal.syncWaits.map((sw) => (
            <Stack gap={3} key={sw.mergeId}>
              <InlineNotification
                kind="warning"
                lowContrast
                hideCloseButton
                title={`${sw.mergeName}: paced by ${sw.bindingName} at ${sw.bindingRate.toLocaleString()}/sh`}
              >
                <ul className="ak-adviceList">
                  {sw.waiters.map((w) => (
                    <li key={w.id}>
                      {w.name} idles ~{w.idle.toLocaleString()}/sh — add a ≈{w.buffer.toLocaleString()}-part buffer to decouple.
                    </li>
                  ))}
                </ul>
              </InlineNotification>
              <Button kind="ghost" size="sm" onClick={() => { setSel(sw.mergeId); setTab("inspect"); }}>
                Inspect merge
              </Button>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

/** Stage 4: how much of what the line starts comes out good. */
export function YieldSection({ api }: { api: FlowPlanApi }) {
  const y = yieldAnalysis(api.model.stations, api.model.flows);
  const withScrap = y.steps.filter((s) => s.scrapRate > 0);
  return (
    <Stack gap={4}>
      <MetricTile
        label="Rolled throughput yield"
        value={`${y.rolledYield}%`}
        unit="good parts"
        sub={`≈ ${y.totalScrap.toLocaleString()} scrap parts/shift across the line`}
      />
      {withScrap.length === 0 ? (
        <Footnote>Set a scrap rate per step in Configure to see where yield is lost.</Footnote>
      ) : (
        <Stack gap={2}>
          {withScrap.map((s) => (
            <div key={s.id} className="ak-kv">
              <span className="ak-kv__k">{s.name}</span>
              <span className="ak-kv__v">
                <Tag type="red" size="sm">
                  {Math.round(s.scrapRate * 100)}% · {Math.round(s.scrapUnits).toLocaleString()}/sh
                </Tag>
              </span>
            </div>
          ))}
        </Stack>
      )}
      <Footnote>
        Rolled yield = ∏(1 − scrap rate) over process steps. Informational — it doesn't change the
        composite grade.
      </Footnote>
    </Stack>
  );
}

function LayoutSettings({ api }: { api: FlowPlanApi }) {
  const t = useT();
  const m = api.model;
  return (
    <Stack gap={4}>
      <SectionLabel>{t("flowPanel.layout.title")}</SectionLabel>
      <TextField id="cell-name" labelText={t("flowPanel.layout.cellName")} value={m.name} onFocus={api.checkpoint} onChange={(v) => api.live({ type: "SET_NAME", name: v })} />
      <FieldRow>
        <NumberField
          id="grid-w"
          label={t("flowPanel.layout.gridW")}
          helperText={t("flowPanel.layout.gridWHelp")}
          value={m.gridW}
          min={1}
          onFocus={api.checkpoint}
          onChange={(v) => api.live({ type: "SET_GRID", gridW: Math.max(1, Number(v) || 1), gridH: m.gridH })}
        />
        <NumberField
          id="grid-h"
          label={t("flowPanel.layout.gridH")}
          value={m.gridH}
          min={1}
          onFocus={api.checkpoint}
          onChange={(v) => api.live({ type: "SET_GRID", gridW: m.gridW, gridH: Math.max(1, Number(v) || 1) })}
        />
      </FieldRow>
      <NumberField
        id="shift-hours"
        label={t("flowPanel.layout.shift")}
        helperText={t("flowPanel.layout.shiftHelp")}
        value={m.shiftHours ?? 8}
        min={1}
        onFocus={api.checkpoint}
        onChange={(v) => api.live({ type: "SET_SHIFT_HOURS", shiftHours: Number(v) || 8 })}
      />
    </Stack>
  );
}

function NoGoSection({ api, mode, setMode }: { api: FlowPlanApi; mode: CanvasMode; setMode: (m: CanvasMode) => void }) {
  const t = useT();
  const zones = api.model.noGoZones ?? [];
  return (
    <Stack gap={4}>
      <SectionLabel>{t("flowPanel.nogo.title")}</SectionLabel>
      <Button kind={mode === "nogo" ? "primary" : "tertiary"} size="sm" renderIcon={Draw} onClick={() => setMode(mode === "nogo" ? "select" : "nogo")}>
        {mode === "nogo" ? t("flowPanel.nogo.drawing") : t("flowPanel.nogo.draw")}
      </Button>
      <Footnote>{t("flowPanel.nogo.help")}</Footnote>
      {zones.length > 0 ? (
        <Stack gap={2}>
          {zones.map((z, i) => (
            <div key={i} className="fk-listrow">
              <span className="fk-listrow__main fk-listrow__text">
                {t("flowPanel.nogo.zone", { i: i + 1, w: z.w, h: z.h, x: z.x, y: z.y })}
              </span>
              <Button
                kind="ghost"
                className="fk-danger"
                hasIconOnly
                size="sm"
                iconDescription={t("flowPanel.nogo.remove", { i: i + 1 })}
                tooltipPosition="left"
                renderIcon={TrashCan}
                onClick={() => api.commit({ type: "REMOVE_NOGO", index: i })}
              />
            </div>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

/**
 * The station the graph already implies should hold a missing I/O role: the one
 * nothing flows into is the input, the one nothing flows out of is the output.
 *
 * "No input area defined" and "No output area defined" are the only validation
 * errors that arrive without a station id, so they were the only ones rendered
 * without a "Fix this step" button — the two hardest issues to act on were the
 * two with no way to act. Suggesting a concrete station turns each into one
 * click (undoable like any other edit).
 */
function roleCandidate(api: FlowPlanApi, role: "input" | "output"): Station | null {
  const stations = api.model.stations.filter((s) => s.role === "process");
  if (stations.length === 0) return null;
  const linked = new Set(api.model.flows.map((f) => (role === "input" ? f.to : f.from)));
  return stations.find((s) => !linked.has(s.id)) ?? stations[0];
}

function MissingRoleIssue({
  api,
  issue,
  setSel,
  setTab,
}: {
  api: FlowPlanApi;
  issue: { sev: string; msg: string };
  setSel: (id: string | null) => void;
  setTab: (t: Tab) => void;
}) {
  const { toast } = useToast();
  const t = useT();
  const role = issue.msg.includes("input area") ? "input" : issue.msg.includes("output area") ? "output" : null;
  const target = role ? roleCandidate(api, role) : null;
  const kind = issue.sev === "err" ? "error" : "warning";
  if (!role || !target) return <InlineNotification kind={kind} lowContrast hideCloseButton title={issue.msg} />;
  return (
    <Stack gap={2}>
      <InlineNotification kind={kind} lowContrast hideCloseButton title={issue.msg} />
      <Button
        kind="ghost"
        size="sm"
        onClick={() => {
          api.commit({ type: "UPDATE_STATION", id: target.id, patch: { role } });
          setSel(target.id);
          setTab("inspect");
          toast(t(role === "input" ? "flowPanel.roleSetInput" : "flowPanel.roleSetOutput", { name: target.name }));
        }}
      >
        {t(role === "input" ? "flowPanel.makeInput" : "flowPanel.makeOutput", { name: target.name })}
      </Button>
    </Stack>
  );
}

export function FlowPanel({ api, setSel, setTab, mode, setMode, lib, onAddProcess }: PanelProps) {
  const t = useT();
  const v = api.validation;
  const errCount = v.issues.filter((i) => i.sev === "err").length;
  return (
    <div className="pad ak-panel">
      <Stack gap={6}>
        {/* When the flow is valid, one quiet line — not a full banner plus a
            section that both say "all good". The heavy treatment (an error
            banner and per-issue fixers) appears only when there is something
            to act on. */}
        {v.valid ? (
          <div className="fk-valid">
            <CheckmarkFilled size={16} className="fk-valid__icon" />
            <span>{t("flowPanel.valid")}</span>
          </div>
        ) : (
          <Stack gap={3}>
            <InlineNotification kind="error" lowContrast hideCloseButton title={t("flowPanel.invalid", { n: errCount })} />
            {v.issues.map((it, i) =>
              it.id ? (
                <Stack gap={2} key={i}>
                  <InlineNotification kind={it.sev === "err" ? "error" : "warning"} lowContrast hideCloseButton title={it.msg} />
                  <Button kind="ghost" size="sm" onClick={() => { setSel(it.id!); setTab("inspect"); }}>
                    {t("flowPanel.fixStep")}
                  </Button>
                </Stack>
              ) : (
                // Coupled to the two id-less messages in the validate engine.
                <MissingRoleIssue key={i} api={api} issue={it} setSel={setSel} setTab={setTab} />
              ),
            )}
          </Stack>
        )}

        <Stack gap={3}>
          <SectionLabel>{t("flowPanel.drawConnections")}</SectionLabel>
          <Button kind={mode === "flow" ? "primary" : "tertiary"} size="sm" renderIcon={Draw} onClick={() => setMode(mode === "flow" ? "select" : "flow")}>
            {mode === "flow" ? t("flowPanel.picking") : t("flowPanel.drawFlow")}
          </Button>
        </Stack>

        <AddStepButtons api={api} setSel={setSel} setTab={setTab} lib={lib} onAddProcess={onAddProcess} />

        <LayoutSettings api={api} />
        <NoGoSection api={api} mode={mode} setMode={setMode} />
      </Stack>
    </div>
  );
}

const LINK_TAG: Record<string, "red" | "green" | "blue" | "gray"> = {
  "auto-island": "red",
  "chained-auto": "green",
  mixed: "blue",
};

/** Stage 5: which steps could run themselves, and where the chains break. */
export function AutomationSection({ api, setSel, setTab }: { api: FlowPlanApi; setSel: (id: string | null) => void; setTab: (t: Tab) => void }) {
  const chain = api.chain;
  return (
      <Stack gap={6}>
        <Stack gap={4}>
          <SectionLabel>Automation chaining</SectionLabel>
          <InlineNotification
            kind={chain.islands > 0 ? "warning" : "success"}
            lowContrast
            hideCloseButton
            title={
              chain.islands > 0
                ? chain.islands + " auto-island(s): two automated steps joined by a manual handoff — prime to chain."
                : "No broken automation chains detected."
            }
          />
          {chain.links.length > 0 ? (
            <Stack gap={3}>
              {chain.links.map((l, i) => (
                <Tile key={i} className="ak-row">
                  <div className="ak-row__head">
                    <span>{l.from + " → " + l.to}</span>
                    <Tag type={LINK_TAG[l.kind] ?? "gray"} size="sm">
                      {l.kind}
                    </Tag>
                  </div>
                  <div className="ak-row__sub">via {l.transport}</div>
                </Tile>
              ))}
            </Stack>
          ) : null}
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Automation potential per step</SectionLabel>
          <Stack gap={3}>
            {api.model.stations
              .filter((s) => s.role === "process")
              .map((s) => {
                const ap = autoPotential(s);
                return (
                  <ClickableTile key={s.id} className="ak-row" onClick={() => { setSel(s.id); setTab("inspect"); }}>
                    <div className="ak-row__head">
                      <span>{s.name}</span>
                      <span className="ak-meter__value">
                        <span className="ak-meter__raw">{ap.verdict}</span>
                        <Tag type={scoreTag(ap.pct)} size="sm">
                          {ap.pct.toFixed(0)}
                        </Tag>
                      </span>
                    </div>
                    <ProgressBar label={s.name} hideLabel size="small" value={Math.round(ap.pct)} max={100} />
                    <div className="ak-row__sub">
                      currently {s.auto} · {ap.src === "override" ? "manual override" : "heuristic"}
                    </div>
                  </ClickableTile>
                );
              })}
          </Stack>
          <Footnote>
            Heuristic weighs type, ergonomics, cycle time, changeover, volume, labor — an opinion, not a
            validated ROI model. Override per step in Configure.
          </Footnote>
        </Stack>
      </Stack>
  );
}

// Freeform footprint editor: paint which cells of the w×h bounding box the
// station occupies. "Fill" clears the mask back to a plain rectangle.
function CellShapeEditor({ api, station }: { api: FlowPlanApi; station: Station }) {
  const t = useT();
  const w = Math.max(1, Math.round(station.w));
  const h = Math.max(1, Math.round(station.h));
  const occ = new Set(stationCells({ x: 0, y: 0, w, h, cells: station.cells }).map((c) => c.x + "," + c.y));
  const toggle = (dx: number, dy: number) => {
    const key = dx + "," + dy;
    const next = new Set(occ);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (next.size === 0) return; // keep at least one cell
    const cells = Array.from(next).map((k) => k.split(",").map(Number) as [number, number]);
    api.commit({ type: "UPDATE_STATION", id: station.id, patch: { cells } });
  };
  const isRect = !(station.cells && station.cells.length);
  return (
    <div className="cds--form-item">
      <div className="cds--label">{isRect ? t("cfg.footprintRect") : t("cfg.footprintCustom")}</div>
      <div className="u-row u-row--top">
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${w}, 16px)`, gap: 2 }}>
          {Array.from({ length: h }).map((_, dy) =>
            Array.from({ length: w }).map((__, dx) => {
              const on = occ.has(dx + "," + dy);
              return (
                <button
                  key={dx + "," + dy}
                  type="button"
                  onClick={() => toggle(dx, dy)}
                  title={`cell ${dx},${dy}`}
                  style={{
                    width: 16,
                    height: 16,
                    padding: 0,
                    border: "1px solid var(--cds-border-strong-01)",
                    background: on ? "var(--cds-interactive)" : "transparent",
                    cursor: "pointer",
                  }}
                />
              );
            }),
          )}
        </div>
        <Button kind="tertiary" size="sm" onClick={() => api.commit({ type: "UPDATE_STATION", id: station.id, patch: { cells: undefined } })}>
          {t("cfg.fillRect")}
        </Button>
      </div>
    </div>
  );
}

export function ConfigurePanel({ api, selId, setSel, setTab, lib, onAddProcess }: PanelProps) {
  const { toast } = useToast();
  const t = useT();
  const m = api.model;
  const s = m.stations.find((x) => x.id === selId);
  const [renameVal, setRenameVal] = useState("");
  const [addTo, setAddTo] = useState("");
  if (!s) {
    // The old copy sent people to an "Automation list" that no longer exists —
    // automation became a section of the Analysis page — and offered no action.
    return (
      <div className="pad ak-panel">
        <EmptyState
          title={t("cfg.noStep.title")}
          body={t("cfg.noStep.body")}
          action={<AddStepButtons api={api} setSel={setSel} setTab={setTab} lib={lib} onAddProcess={onAddProcess} />}
        />
      </div>
    );
  }
  const outFlows = m.flows.filter((f) => f.from === s.id);
  const inCount = m.flows.filter((f) => f.to === s.id).length;
  const up = (patch: Record<string, unknown>) => api.commit({ type: "UPDATE_STATION", id: s.id, patch });
  const live = (patch: Record<string, unknown>) => api.live({ type: "UPDATE_STATION", id: s.id, patch });
  return (
    <div className="pad ak-panel">
      <Stack gap={6}>
        <div className="ak-row__head">
          <SectionLabel>{t("cfg.heading", { id: s.id })}</SectionLabel>
          <div className="fk-inline">
            {/* Duplicating a station was reachable only through Ctrl+D, which is
                advertised nowhere in the UI. */}
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Copy}
              onClick={() => {
                const clone = cloneStation(m, s);
                api.commit({ type: "ADD_STATION", station: clone });
                setSel(clone.id);
              }}
            >
              {t("common.duplicate")}
            </Button>
            <Button
              kind="danger--tertiary"
              size="sm"
              renderIcon={TrashCan}
              onClick={() => { api.commit({ type: "DELETE_STATION", id: s.id }); setSel(null); }}
            >
              {t("scenario.delete")}
            </Button>
          </div>
        </div>

        <Stack gap={4}>
          <TextField id="cfg-name" labelText={t("cfg.name")} value={s.name} onFocus={api.checkpoint} onChange={(v) => live({ name: v })} />
          {/* Renaming the station *id* rewrites every flow that references it —
              a rare, power move, so it is tucked into a disclosure instead of
              sitting above the everyday fields. */}
          <details className="fk-advanced">
            <summary>{t("cfg.stationId")}</summary>
            <div className="fk-inline">
              <TextField
                id="cfg-rename"
                labelText={t("cfg.stationId")}
                hideLabel
                placeholder={s.id}
                helperText={t("cfg.stationIdHelp")}
                value={renameVal}
                onChange={setRenameVal}
              />
              <Button
                size="sm"
                kind="secondary"
                onClick={() => {
                  const nid = renameVal.trim();
                  if (!nid) return;
                  if (m.stations.some((x) => x.id === nid)) { toast(t("cfg.idTaken"), "err"); return; }
                  api.commit({ type: "RENAME_STATION", oldId: s.id, newId: nid });
                  setSel(nid);
                  setRenameVal("");
                }}
              >
                {t("cfg.rename")}
              </Button>
            </div>
          </details>
          <FieldRow>
            <SelectField id="cfg-role" labelText={t("cfg.role")} value={s.role} options={ROLES} onChange={(v) => up({ role: v })} />
            <SelectField id="cfg-type" labelText={t("cfg.type")} value={s.type} options={STATION_TYPES} onChange={(v) => up({ type: v })} />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>{t("cfg.footprint")}</SectionLabel>
          <FieldRow>
            <NumberField id="cfg-w" label={t("cfg.width")} value={s.w} min={1} onFocus={api.checkpoint} onChange={(v) => live({ w: Math.max(1, Number(v) || 1) })} />
            <NumberField id="cfg-h" label={t("cfg.height")} value={s.h} min={1} onFocus={api.checkpoint} onChange={(v) => live({ h: Math.max(1, Number(v) || 1) })} />
          </FieldRow>
          <CellShapeEditor api={api} station={s} />
          <FieldRow>
            <SelectField id="cfg-in" labelText={t("cfg.inPort")} helperText={t("cfg.inPortHelp")} value={s.inSide ?? "left"} options={SIDES} onChange={(v) => up({ inSide: v as Side })} />
            <SelectField id="cfg-out" labelText={t("cfg.outPort")} helperText={t("cfg.outPortHelp")} value={s.outSide ?? "right"} options={SIDES} onChange={(v) => up({ outSide: v as Side })} />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>{t("cfg.throughput")}</SectionLabel>
          <FieldRow>
            <NumberField id="cfg-cap" label={t("cfg.capacity")} value={s.capacityPerShift} min={0} onFocus={api.checkpoint} onChange={(v) => live({ capacityPerShift: Number(v) || 0 })} />
            <NumberField id="cfg-ops" label={t("cfg.operators")} value={s.operators} min={0} onFocus={api.checkpoint} onChange={(v) => live({ operators: Number(v) || 0 })} />
          </FieldRow>
          <FieldRow>
            <NumberField
              id="cfg-parallel"
              label={t("cfg.parallel")}
              helperText={t("cfg.parallelHelp")}
              value={s.parallelUnits ?? 1}
              min={1}
              onFocus={api.checkpoint}
              onChange={(v) => live({ parallelUnits: Math.max(1, Math.round(Number(v) || 1)) })}
            />
            {outFlows.length > 1 ? (
              <SelectField
                id="cfg-split"
                labelText={t("cfg.splitMode")}
                helperText={t("cfg.splitModeHelp")}
                value={s.splitMode ?? "distribute"}
                options={SPLIT_MODES}
                onChange={(v) => up({ splitMode: v })}
              />
            ) : (
              <div />
            )}
          </FieldRow>
          {inCount > 1 ? (
            <SelectField
              id="cfg-merge"
              labelText={t("cfg.mergeMode")}
              helperText={t("cfg.mergeModeHelp")}
              value={s.mergeMode ?? "sum"}
              options={MERGE_MODES}
              onChange={(v) => up({ mergeMode: v })}
            />
          ) : null}
          <FieldRow>
            <SelectField id="cfg-scrapside" labelText={t("cfg.scrapPort")} value={s.scrapSide ?? "bottom"} options={SIDES} onChange={(v) => up({ scrapSide: v as Side })} />
            <NumberField
              id="cfg-scraprate"
              label={t("cfg.scrapRate")}
              helperText={t("cfg.scrapRateHelp")}
              value={Math.round((s.scrapRate ?? 0) * 100)}
              min={0}
              max={100}
              onFocus={api.checkpoint}
              onChange={(v) => live({ scrapRate: Math.max(0, Math.min(100, Number(v) || 0)) / 100 })}
            />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>{t("cfg.cycleTime")}</SectionLabel>
          <FieldRow>
            <NumberField
              id="cfg-cycle"
              label={t("cfg.cycleTimeS")}
              helperText={s.cycle ? t("cfg.cycleTimeDerived") : undefined}
              value={s.cycleTimeSec}
              min={0}
              disabled={!!s.cycle}
              onFocus={api.checkpoint}
              onChange={(v) => live({ cycleTimeSec: Number(v) || 0 })}
            />
            <NumberField id="cfg-changeover" label={t("cfg.changeover")} value={s.changeoverMin} min={0} onFocus={api.checkpoint} onChange={(v) => live({ changeoverMin: Number(v) || 0 })} />
          </FieldRow>
          <CycleBreakdownEditor api={api} s={s} />
          <FieldRow>
            <SelectField id="cfg-ergo" labelText={t("cfg.ergo")} value={s.ergoRisk} options={ERGO} onChange={(v) => up({ ergoRisk: v })} />
            <NumberField
              id="cfg-shifthours"
              label={t("cfg.shiftOverride")}
              helperText={t("cfg.shiftOverrideHelp")}
              value={s.shiftHours ?? ""}
              min={0}
              allowEmpty
              onFocus={api.checkpoint}
              onChange={(v) => live({ shiftHours: v === "" ? undefined : Number(v) || 0 })}
            />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>{t("cfg.automationPlacement")}</SectionLabel>
          <FieldRow>
            <SelectField id="cfg-auto" labelText={t("cfg.autoState")} value={s.auto} options={AUTO} onChange={(v) => up({ auto: v })} />
            <SelectField
              id="cfg-autooverride"
              labelText={t("cfg.automateOverride")}
              value={s.autoOverride ?? "auto"}
              onChange={(v) => up({ autoOverride: v === "auto" ? null : v })}
            >
              <SelectItem value="auto" text="heuristic" />
              <SelectItem value="yes" text="force yes" />
              <SelectItem value="no" text="force no" />
            </SelectField>
          </FieldRow>
          <Toggle
            id="cfg-fixed"
            size="sm"
            labelText={t("cfg.placement")}
            labelA={t("cfg.movable")}
            labelB={t("cfg.fixed")}
            toggled={!!s.fixed}
            onToggle={(checked) => up({ fixed: checked })}
          />
        </Stack>

        <Stack gap={4}>
          <SectionLabel>{t("cfg.cost")}</SectionLabel>
          <FieldRow>
            <NumberField
              id="cfg-capex"
              label={t("cfg.capex")}
              helperText={t("cfg.capexHelp")}
              value={s.capex ?? 0}
              min={0}
              onFocus={api.checkpoint}
              onChange={(v) => live({ capex: Math.max(0, Number(v) || 0) })}
            />
            <NumberField
              id="cfg-autocapex"
              label={t("cfg.autoCapex")}
              helperText={t("cfg.autoCapexHelp")}
              value={s.automationCapex ?? 0}
              min={0}
              onFocus={api.checkpoint}
              onChange={(v) => live({ automationCapex: Math.max(0, Number(v) || 0) })}
            />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>{t("cfg.notes")}</SectionLabel>
          <TextField
            id="cfg-utils"
            labelText={t("cfg.utilities")}
            value={(s.utilities ?? []).join(", ")}
            onFocus={api.checkpoint}
            onChange={(v) => live({ utilities: v.split(",").map((x) => x.trim()).filter(Boolean) })}
          />
          <TextAreaField id="cfg-notes" labelText={t("cfg.notes")} rows={3} value={s.notes ?? ""} onFocus={api.checkpoint} onChange={(v) => live({ notes: v })} />
        </Stack>

        <Stack gap={4}>
          <SectionLabel>{t("cfg.connections")}</SectionLabel>
          <Footnote>{t("cfg.outgoingFlows")}</Footnote>
          {outFlows.map((f, i) => (
            <Tile key={i} className="ak-row">
              <div className="ak-row__head">
                <span>→ {f.to}</span>
                <Button
                  kind="ghost"
                  className="fk-danger"
                  hasIconOnly
                  size="sm"
                  iconDescription={t("cfg.removeFlow", { to: f.to })}
                  tooltipPosition="left"
                  renderIcon={TrashCan}
                  onClick={() => api.commit({ type: "REMOVE_FLOW", from: f.from, to: f.to })}
                />
              </div>
              <FieldRow>
                <NumberField
                  id={`flow-vol-${i}`}
                  label={t("cfg.volume")}
                  value={f.volume}
                  min={0}
                  onFocus={api.checkpoint}
                  onChange={(v) => api.live({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { volume: Number(v) || 0 } })}
                />
                <SelectField
                  id={`flow-transport-${i}`}
                  labelText={t("cfg.transport")}
                  value={f.transport}
                  options={TRANSPORT}
                  onChange={(v) => api.commit({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { transport: v as Flow["transport"] } })}
                />
              </FieldRow>
            </Tile>
          ))}
          <div className="fk-inline">
            <SelectField id="cfg-addflow" labelText={t("cfg.addFlow")} value={addTo} onChange={setAddTo}>
              <SelectItem value="" text={t("cfg.selectStep")} disabled />
              {m.stations.filter((x) => x.id !== s.id).map((x) => (
                <SelectItem key={x.id} value={x.id} text={x.name} />
              ))}
            </SelectField>
            <Button size="sm" kind="secondary" renderIcon={Add} onClick={() => { if (addTo) { api.commit({ type: "ADD_FLOW", from: s.id, to: addTo }); setAddTo(""); } }}>
              {t("cfg.add")}
            </Button>
          </div>
        </Stack>
      </Stack>
    </div>
  );
}

// Cycle decomposition editor. Opt-in per station: until "Decompose" is pressed
// the station keeps a single opaque cycleTimeSec and nothing about its scoring
// changes.
function CycleBreakdownEditor({ api, s }: { api: FlowPlanApi; s: Station }) {
  if (s.role !== "process") return null;

  if (!s.cycle) {
    return (
      <div>
        <Button
          kind="tertiary"
          size="sm"
          onClick={() => {
            api.checkpoint();
            api.live({ type: "SET_CYCLE_BREAKDOWN", id: s.id, cycle: seedBreakdown(s) });
          }}
        >
          Decompose cycle
        </Button>
        <Footnote>split {s.cycleTimeSec}s into value-add &amp; waste</Footnote>
      </div>
    );
  }

  const total = s.cycleTimeSec;
  const va = s.cycle.valueAddSec;
  const vaPct = total > 0 ? Math.round((va / total) * 100) : 0;

  return (
    <Tile className="ak-breakdown">
      <Stack gap={4}>
        <div className="ak-row__head">
          <SectionLabel help="Only value-add transforms the part. The other four classes are waste — the cycle time is their sum.">
            Cycle breakdown
          </SectionLabel>
          <Button
            kind="ghost"
            size="sm"
            onClick={() => {
              api.checkpoint();
              api.live({ type: "SET_CYCLE_BREAKDOWN", id: s.id, cycle: undefined });
            }}
          >
            Reset
          </Button>
        </div>

        <Stack gap={3}>
          {CYCLE_KEYS.map((k) => (
            <NumberField
              key={k}
              id={`cyc-${k}`}
              label={CYCLE_LABELS[k]}
              value={(s.cycle as CycleBreakdown)[k]}
              min={0}
              onFocus={api.checkpoint}
              onChange={(v) => api.live({ type: "PATCH_CYCLE_BREAKDOWN", id: s.id, patch: { [k]: Math.max(0, Number(v) || 0) } })}
            />
          ))}
        </Stack>

        <div className="ak-kv ak-breakdown__total">
          <span className="ak-kv__k">Total cycle</span>
          <span className="ak-kv__v">
            <b>{total}s</b> · {vaPct}% value-add
          </span>
        </div>
      </Stack>
    </Tile>
  );
}

// Mirrors the keydown handler in App. These were undiscoverable: the shortcuts
// were implemented but written down nowhere in the app.
const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl/Cmd + Z", "Undo"],
  ["Ctrl/Cmd + Shift + Z", "Redo"],
  ["Ctrl/Cmd + D", "Duplicate the selected station"],
  ["Ctrl/Cmd + C / V", "Copy / paste a station"],
  ["Delete / Backspace", "Delete the selected station"],
  ["Arrow keys", "Nudge the selected station one grid unit"],
  ["Esc", "Clear the selection and leave draw mode"],
  ["1 / 2 / 3 / 4", "Actual · Improved · Both · DAG view"],
];

export function SchemaPanel() {
  const tbl = (rows: Array<[string, string, string, number?]>) => (
    <table className="schemaTbl">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r[3] ? (
              <>
                <th>{r[0]}</th>
                <th>{r[1]}</th>
                <th>{r[2]}</th>
              </>
            ) : (
              <>
                <td>{r[0]}</td>
                <td>{r[1]}</td>
                <td>{r[2]}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div className="pad ak-panel">
      <Stack gap={3}>
        <SectionLabel>Keyboard shortcuts</SectionLabel>

        <Stack gap={2}>
          {SHORTCUTS.map(([keys, what]) => (
            <div className="ak-shortcut" key={keys}>
              <kbd className="ak-kbd">{keys}</kbd>
              <span>{what}</span>
            </div>
          ))}
        </Stack>
      </Stack>

      <div className="lab" style={{ margin: "20px 0 8px" }}>
        Data model
      </div>
      <div className="u-caption">
        The whole layout is one JSON object. Export gives exactly this; Load expects it. Missing fields
        fill with defaults on import, and older files are migrated forward automatically.
      </div>
      <div className="u-caption">
        <code>root</code>
      </div>
      {tbl([
        ["field", "type", "meaning", 1],
        ["schemaVersion", "int", "migration version (auto)"],
        ["name", "string", "layout label"],
        ["gridW, gridH", "int", "grid size (units)"],
        ["shiftHours", "number", "default shift length"],
        ["weights", "object?", "KPI weight override (else defaults)"],
        ["costConfig", "object?", "labor/energy/shifts assumptions"],
        ["stations", "array", "steps / areas"],
        ["flows", "array", "material movements"],
        ["noGoZones", "array", "blocked rects {x,y,w,h}"],
      ])}
      <div className="u-caption">
        <code>station</code>
      </div>
      {tbl([
        ["field", "type", "meaning", 1],
        ["id", "string", "unique key (flows reference it)"],
        ["name", "string", "display name"],
        ["role", "enum", "input · process · output"],
        ["type", "enum", "machine·manual·quality·store·buffer"],
        ["x,y,w,h", "int", "grid position & footprint"],
        ["fixed", "bool", "anchored — optimizer won't move it"],
        ["auto", "enum", "manual·semi·auto (current state)"],
        ["autoOverride", "enum?", "null·yes·no (override potential)"],
        ["capacityPerShift", "int", "throughput ceiling"],
        ["operators", "int", "staffing"],
        ["cycleTimeSec", "int", "per-part cycle (derived from cycle when present)"],
        ["cycle", "obj?", "valueAdd/handling/walk/wait/setupSec — absent = not decomposed"],
        ["changeoverMin", "int", "setup/changeover time"],
        ["ergoRisk", "enum", "low·med·high"],
        ["shiftHours", "number?", "per-station shift override"],
        ["cells", "[x,y][]?", "occupied cells (absent ⇒ rectangle)"],
        ["inSide/outSide", "enum?", "port edge: left·right·top·bottom"],
        ["scrapSide", "enum?", "scrap-out edge"],
        ["scrapRate", "number?", "0–1 scrapped (Yield panel)"],
        ["parallelUnits", "int?", "identical parallel lanes (×N capacity)"],
        ["splitMode", "enum?", "distribute·fork (outgoing)"],
        ["mergeMode", "enum?", "sum·assemble (incoming)"],
        ["capex / automationCapex", "number?", "cost & ROI (Cost tab)"],
        ["energyKw", "number?", "power draw → energy opex"],
        ["utilities", "string[]", "power, air, coolant…"],
        ["notes", "string", "free text"],
      ])}
      <div className="u-caption">
        <code>flow</code>
      </div>
      {tbl([
        ["field", "type", "meaning", 1],
        ["from, to", "string", "station ids"],
        ["volume", "int", "parts/shift moved"],
        ["unitCost", "float", "cost per unit-distance"],
        ["transport", "enum", "manual·forklift·conveyor·agv"],
        ["partWeightKg", "float", "per-part weight"],
        ["share", "number?", "split fraction (distribute)"],
        ["unitsPerAssembly", "int?", "inputs per assembled unit"],
        ["notes", "string", "free text"],
      ])}
      <div className="u-caption">
        Flow cost = Σ(volume × rectilinear-distance × unitCost). Chaining reads auto on both ends +
        transport: two auto steps with conveyor/agv = chained; with a manual handoff = auto-island.
      </div>
    </div>
  );
}
