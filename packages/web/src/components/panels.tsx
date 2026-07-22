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
import { Add, Draw, TrashCan } from "@carbon/icons-react";
import { Footnote, KpiMeter, MetricTile, SectionLabel, ShareBar, scoreTag } from "./analysisKit";
import { FieldRow, NumberField, SelectField, TextAreaField, TextField } from "./formKit";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { makeStation } from "@flowplan/core/store/reducer";
import { AUTO, CYCLE_KEYS, ERGO, MERGE_MODES, ROLES, SIDES, SPLIT_MODES, STATION_TYPES, TRANSPORT, type CycleBreakdown, type Flow, type RatingWeights, type Side, type Station } from "@flowplan/core/model/types";
import type { CellForm } from "@flowplan/core/engine/templates";
import { WEIGHTS, normalizeWeights } from "@flowplan/core/engine/rating";
import { bottleneckAdvice } from "@flowplan/core/engine/balance";
import { CYCLE_LABELS, cycleAdvice, cycleAnalysis, seedBreakdown } from "@flowplan/core/engine/cycle";
import { findImprovements, type Improvement } from "@flowplan/core/engine/improve";
import { yieldAnalysis } from "@flowplan/core/engine/yield";
import { stationCells } from "@flowplan/core/engine/geometry";
import { autoPotential } from "@flowplan/core/engine/automation";
import { YamazumiChart } from "./charts";
import { CYCLE_COL, TEXTD } from "./colors";
import { useToast } from "./ui";
import type { CanvasMode } from "./LayoutCanvas";
import {
  deleteScenario,
  listScenarios,
  loadScenario,
  saveScenario,
} from "../store/scenarios";

export type Tab = "rating" | "balance" | "flow" | "auto" | "inspect" | "cost" | "chat" | "schema" | "workload";

export interface PanelProps {
  api: FlowPlanApi;
  selId: string | null;
  setSel: (id: string | null) => void;
  setTab: (t: Tab) => void;
  setView: (v: "actual" | "improved" | "split") => void;
  mode: CanvasMode;
  setMode: (m: CanvasMode) => void;
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

export function RatingPanel({ api, setView, setSel, setTab }: PanelProps) {
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
    <div className="pad ak-panel">
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

        <Stack gap={4}>
          <SectionLabel>Where the cost sits</SectionLabel>
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
        </Stack>

        <WeightsEditor api={api} />
      </Stack>
    </div>
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
      >
        {open ? "▾" : "▸"} Adjust KPI weights{custom ? " (custom)" : ""}
      </Button>
      {open ? (
        <Stack gap={5}>
          <Footnote>
            Re-weight the composite to match your priorities. Values are normalized to 100%; the grade updates live.
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

export function BalancePanel({ api, setSel, setTab }: PanelProps) {
  const bal = api.rating.balance;
  const advice = bottleneckAdvice(bal, api.model.stations);
  const maxRate = bal.maxRate || 1;
  const bottleneck = bal.bottleneck;
  return (
    <div className="pad ak-panel">
      <Stack gap={6}>
        <SectionLabel>Line balance &amp; bottleneck</SectionLabel>

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
                />
              );
            })}
          </Stack>
          <Footnote>
            Rate = min(3600/cycle × shift-hours × operators, capacity/shift) × parallel units. Low-util
            steps are starved by the bottleneck — that's spare capacity, not a problem to fix.
          </Footnote>
        </Stack>

        <CycleSection api={api} setSel={setSel} setTab={setTab} />
        <ParallelSection api={api} setSel={setSel} setTab={setTab} />
        <YieldSection api={api} />
      </Stack>
    </div>
  );
}

// Value-add vs waste. Only meaningful once at least one step is decomposed, so
// the section leads with a prompt rather than an empty chart.
function CycleSection({ api, setSel, setTab }: { api: FlowPlanApi; setSel: (id: string | null) => void; setTab: (t: Tab) => void }) {
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
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, background: CYCLE_COL[k], borderRadius: 2, display: "inline-block" }} />
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
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-02)" }}>
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

function YieldSection({ api }: { api: FlowPlanApi }) {
  const y = yieldAnalysis(api.model.stations, api.model.flows);
  const withScrap = y.steps.filter((s) => s.scrapRate > 0);
  return (
    <Stack gap={4}>
      <SectionLabel>Yield &amp; scrap</SectionLabel>
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

function ScenarioSection({ api }: { api: FlowPlanApi }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [tick, setTick] = useState(0);
  const scenarios = listScenarios();
  const save = () => {
    const n = name.trim() || api.model.name || "Variant";
    saveScenario(n, api.model);
    setName("");
    setTick((t) => t + 1);
    toast("Saved scenario “" + n + "”");
  };
  return (
    <Stack gap={4}>
      <SectionLabel>Scenarios (compare variants)</SectionLabel>
      <div className="fk-inline">
        <TextField id="scenario-name" labelText="Variant name" placeholder="name this variant…" value={name} onChange={setName} />
        <Button size="sm" kind="secondary" onClick={save}>
          Save
        </Button>
      </div>
      {scenarios.length === 0 ? (
        <Footnote>Save the current layout as a named variant to compare alternatives.</Footnote>
      ) : (
        <Stack gap={2}>
          {scenarios.map((s) => (
            <div key={s.name + tick} className="fk-listrow">
              <Button
                kind="ghost"
                size="sm"
                className="fk-listrow__main"
                onClick={() => { const m = loadScenario(s.name); if (m) { api.reset(m); toast("Loaded “" + s.name + "”"); } }}
              >
                {s.name}
              </Button>
              <Button
                kind="ghost"
                className="fk-danger"
                hasIconOnly
                size="sm"
                iconDescription={`Delete ${s.name}`}
                tooltipPosition="left"
                renderIcon={TrashCan}
                onClick={() => { deleteScenario(s.name); setTick((t) => t + 1); }}
              />
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function LayoutSettings({ api }: { api: FlowPlanApi }) {
  const m = api.model;
  return (
    <Stack gap={4}>
      <SectionLabel>Layout settings</SectionLabel>
      <TextField id="cell-name" labelText="Cell name" value={m.name} onFocus={api.checkpoint} onChange={(v) => api.live({ type: "SET_NAME", name: v })} />
      <FieldRow>
        <NumberField
          id="grid-w"
          label="Grid width"
          helperText="Stations re-clamp when shrunk."
          value={m.gridW}
          min={1}
          onFocus={api.checkpoint}
          onChange={(v) => api.live({ type: "SET_GRID", gridW: Math.max(1, Number(v) || 1), gridH: m.gridH })}
        />
        <NumberField
          id="grid-h"
          label="Grid height"
          value={m.gridH}
          min={1}
          onFocus={api.checkpoint}
          onChange={(v) => api.live({ type: "SET_GRID", gridW: m.gridW, gridH: Math.max(1, Number(v) || 1) })}
        />
      </FieldRow>
      <NumberField
        id="shift-hours"
        label="Shift length (hours)"
        helperText="Balance-model default; stations can override in Configure."
        value={m.shiftHours ?? 8}
        min={1}
        onFocus={api.checkpoint}
        onChange={(v) => api.live({ type: "SET_SHIFT_HOURS", shiftHours: Number(v) || 8 })}
      />
    </Stack>
  );
}

function NoGoSection({ api, mode, setMode }: { api: FlowPlanApi; mode: CanvasMode; setMode: (m: CanvasMode) => void }) {
  const zones = api.model.noGoZones ?? [];
  return (
    <Stack gap={4}>
      <SectionLabel>No-go zones</SectionLabel>
      <Button kind={mode === "nogo" ? "primary" : "tertiary"} size="sm" renderIcon={Draw} onClick={() => setMode(mode === "nogo" ? "select" : "nogo")}>
        {mode === "nogo" ? "Drawing… (click to stop)" : "Draw a no-go zone"}
      </Button>
      <Footnote>Drag a rectangle on the canvas. The optimizer and templates avoid these.</Footnote>
      {zones.length > 0 ? (
        <Stack gap={2}>
          {zones.map((z, i) => (
            <div key={i} className="fk-listrow">
              <span className="fk-listrow__main fk-listrow__text">
                zone {i + 1} · {z.w}×{z.h} @ ({z.x},{z.y})
              </span>
              <Button
                kind="ghost"
                className="fk-danger"
                hasIconOnly
                size="sm"
                iconDescription={`Remove zone ${i + 1}`}
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

export function FlowPanel({ api, setSel, setTab, mode, setMode }: PanelProps) {
  const { toast } = useToast();
  const v = api.validation;
  const errCount = v.issues.filter((i) => i.sev === "err").length;
  return (
    <div className="pad ak-panel">
      <Stack gap={6}>
        <InlineNotification
          kind={v.valid ? "success" : "error"}
          lowContrast
          hideCloseButton
          title={v.valid ? "Process flow is valid" : `${errCount} blocking issue(s) found`}
          subtitle={v.valid ? "Every step connects input → output." : undefined}
        />

        <Stack gap={3}>
          <SectionLabel>Validation</SectionLabel>
          {v.issues.length === 0 ? (
            <Footnote>No dead ends, orphans, or unreachable steps.</Footnote>
          ) : (
            v.issues.map((it, i) =>
              it.id ? (
                <Stack gap={2} key={i}>
                  <InlineNotification kind={it.sev === "err" ? "error" : "warning"} lowContrast hideCloseButton title={it.msg} />
                  <Button kind="ghost" size="sm" onClick={() => { setSel(it.id!); setTab("inspect"); }}>
                    Fix this step
                  </Button>
                </Stack>
              ) : (
                <InlineNotification key={i} kind={it.sev === "err" ? "error" : "warning"} lowContrast hideCloseButton title={it.msg} />
              ),
            )
          )}
        </Stack>

        <Stack gap={3}>
          <SectionLabel>Draw connections</SectionLabel>
          <Button kind={mode === "flow" ? "primary" : "tertiary"} size="sm" renderIcon={Draw} onClick={() => setMode(mode === "flow" ? "select" : "flow")}>
            {mode === "flow" ? "Picking… tap source then target" : "Draw a flow on the canvas"}
          </Button>
        </Stack>

        <Stack gap={3}>
          <SectionLabel>Cell form templates</SectionLabel>
          <div style={{ display: "flex", gap: "var(--sp-02)", flexWrap: "wrap" }}>
            {(["I", "U", "L", "S"] as CellForm[]).map((fm) => (
              <Button key={fm} kind="tertiary" size="sm" onClick={() => { api.commit({ type: "APPLY_TEMPLATE", form: fm }); toast(fm + "-shape applied"); }}>
                {fm}-shape
              </Button>
            ))}
          </div>
          <Footnote>Arranges movable process steps along the chosen form. Fixed and I/O stations stay put.</Footnote>
        </Stack>

        <Button
          kind="secondary"
          size="sm"
          renderIcon={Add}
          onClick={() => {
            const ns = makeStation(api.model);
            api.commit({ type: "ADD_STATION", station: ns });
            setSel(ns.id);
            setTab("inspect");
          }}
        >
          Add process step
        </Button>

        <LayoutSettings api={api} />
        <NoGoSection api={api} mode={mode} setMode={setMode} />
        <ScenarioSection api={api} />
      </Stack>
    </div>
  );
}

const LINK_TAG: Record<string, "red" | "green" | "blue" | "gray"> = {
  "auto-island": "red",
  "chained-auto": "green",
  mixed: "blue",
};

export function AutomationPanel({ api, setSel, setTab }: PanelProps) {
  const chain = api.chain;
  return (
    <div className="pad ak-panel">
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
    </div>
  );
}

// Freeform footprint editor: paint which cells of the w×h bounding box the
// station occupies. "Fill" clears the mask back to a plain rectangle.
function CellShapeEditor({ api, station }: { api: FlowPlanApi; station: Station }) {
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
      <div className="cds--label">Footprint shape {isRect ? "(rectangle)" : "(custom)"}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
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
          Fill (rect)
        </Button>
      </div>
    </div>
  );
}

export function ConfigurePanel({ api, selId, setSel }: PanelProps) {
  const { toast } = useToast();
  const m = api.model;
  const s = m.stations.find((x) => x.id === selId);
  const [renameVal, setRenameVal] = useState("");
  const [addTo, setAddTo] = useState("");
  if (!s) {
    return (
      <div className="pad ak-panel">
        <Footnote>
          Tap a station on the layout (or in the Automation/Flow lists) to configure it. Use Flow ▸ Add a step to create new ones.
        </Footnote>
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
          <SectionLabel>Configure · {s.id}</SectionLabel>
          <Button
            kind="danger--tertiary"
            size="sm"
            renderIcon={TrashCan}
            onClick={() => { api.commit({ type: "DELETE_STATION", id: s.id }); setSel(null); }}
          >
            Delete
          </Button>
        </div>

        <Stack gap={4}>
          <TextField id="cfg-name" labelText="Name" value={s.name} onFocus={api.checkpoint} onChange={(v) => live({ name: v })} />
          <div className="fk-inline">
            <TextField
              id="cfg-rename"
              labelText="Station id (rename)"
              placeholder={s.id}
              helperText="Renaming rewrites every flow that references this station."
              value={renameVal}
              onChange={setRenameVal}
            />
            <Button
              size="sm"
              kind="secondary"
              onClick={() => {
                const nid = renameVal.trim();
                if (!nid) return;
                if (m.stations.some((x) => x.id === nid)) { toast("That id is already taken", "err"); return; }
                api.commit({ type: "RENAME_STATION", oldId: s.id, newId: nid });
                setSel(nid);
                setRenameVal("");
              }}
            >
              Rename
            </Button>
          </div>
          <FieldRow>
            <SelectField id="cfg-role" labelText="Role (I/O flexible)" value={s.role} options={ROLES} onChange={(v) => up({ role: v })} />
            <SelectField id="cfg-type" labelText="Type" value={s.type} options={STATION_TYPES} onChange={(v) => up({ type: v })} />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Footprint &amp; ports</SectionLabel>
          <FieldRow>
            <NumberField id="cfg-w" label="Width" value={s.w} min={1} onFocus={api.checkpoint} onChange={(v) => live({ w: Math.max(1, Number(v) || 1) })} />
            <NumberField id="cfg-h" label="Height" value={s.h} min={1} onFocus={api.checkpoint} onChange={(v) => live({ h: Math.max(1, Number(v) || 1) })} />
          </FieldRow>
          <CellShapeEditor api={api} station={s} />
          <FieldRow>
            <SelectField id="cfg-in" labelText="IN port" helperText="Edge material enters." value={s.inSide ?? "left"} options={SIDES} onChange={(v) => up({ inSide: v as Side })} />
            <SelectField id="cfg-out" labelText="OUT port" helperText="Edge material exits." value={s.outSide ?? "right"} options={SIDES} onChange={(v) => up({ outSide: v as Side })} />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Throughput</SectionLabel>
          <FieldRow>
            <NumberField id="cfg-cap" label="Capacity/shift" value={s.capacityPerShift} min={0} onFocus={api.checkpoint} onChange={(v) => live({ capacityPerShift: Number(v) || 0 })} />
            <NumberField id="cfg-ops" label="Operators" value={s.operators} min={0} onFocus={api.checkpoint} onChange={(v) => live({ operators: Number(v) || 0 })} />
          </FieldRow>
          <FieldRow>
            <NumberField
              id="cfg-parallel"
              label="Parallel units (×N)"
              helperText="Identical lanes; capacity scales ×N."
              value={s.parallelUnits ?? 1}
              min={1}
              onFocus={api.checkpoint}
              onChange={(v) => live({ parallelUnits: Math.max(1, Math.round(Number(v) || 1)) })}
            />
            {outFlows.length > 1 ? (
              <SelectField
                id="cfg-split"
                labelText="Split mode"
                helperText="distribute = share; fork = full count."
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
              labelText="Merge mode"
              helperText="sum = rates add; assemble = one of each input."
              value={s.mergeMode ?? "sum"}
              options={MERGE_MODES}
              onChange={(v) => up({ mergeMode: v })}
            />
          ) : null}
          <FieldRow>
            <SelectField id="cfg-scrapside" labelText="Scrap port" value={s.scrapSide ?? "bottom"} options={SIDES} onChange={(v) => up({ scrapSide: v as Side })} />
            <NumberField
              id="cfg-scraprate"
              label="Scrap rate (%)"
              helperText="Shown in Balance ▸ Yield; not graded."
              value={Math.round((s.scrapRate ?? 0) * 100)}
              min={0}
              max={100}
              onFocus={api.checkpoint}
              onChange={(v) => live({ scrapRate: Math.max(0, Math.min(100, Number(v) || 0)) / 100 })}
            />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Cycle time</SectionLabel>
          <FieldRow>
            <NumberField
              id="cfg-cycle"
              label="Cycle time (s)"
              helperText={s.cycle ? "Derived from the breakdown below." : undefined}
              value={s.cycleTimeSec}
              min={0}
              disabled={!!s.cycle}
              onFocus={api.checkpoint}
              onChange={(v) => live({ cycleTimeSec: Number(v) || 0 })}
            />
            <NumberField id="cfg-changeover" label="Changeover (min)" value={s.changeoverMin} min={0} onFocus={api.checkpoint} onChange={(v) => live({ changeoverMin: Number(v) || 0 })} />
          </FieldRow>
          <CycleBreakdownEditor api={api} s={s} />
          <FieldRow>
            <SelectField id="cfg-ergo" labelText="Ergonomic risk" value={s.ergoRisk} options={ERGO} onChange={(v) => up({ ergoRisk: v })} />
            <NumberField
              id="cfg-shifthours"
              label="Shift hours (override)"
              helperText="Blank = cell default."
              value={s.shiftHours ?? ""}
              min={0}
              allowEmpty
              onFocus={api.checkpoint}
              onChange={(v) => live({ shiftHours: v === "" ? undefined : Number(v) || 0 })}
            />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Automation &amp; placement</SectionLabel>
          <FieldRow>
            <SelectField id="cfg-auto" labelText="Automation state" value={s.auto} options={AUTO} onChange={(v) => up({ auto: v })} />
            <SelectField
              id="cfg-autooverride"
              labelText="Automate? (override)"
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
            labelText="Placement"
            labelA="Movable"
            labelB="Fixed — won't be moved"
            toggled={!!s.fixed}
            onToggle={(checked) => up({ fixed: checked })}
          />
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Cost</SectionLabel>
          <FieldRow>
            <NumberField
              id="cfg-capex"
              label="Equipment capex"
              helperText="One-time equipment cost (Cost tab)."
              value={s.capex ?? 0}
              min={0}
              onFocus={api.checkpoint}
              onChange={(v) => live({ capex: Math.max(0, Number(v) || 0) })}
            />
            <NumberField
              id="cfg-autocapex"
              label="Automation capex"
              helperText="Cost to automate — drives ROI payback."
              value={s.automationCapex ?? 0}
              min={0}
              onFocus={api.checkpoint}
              onChange={(v) => live({ automationCapex: Math.max(0, Number(v) || 0) })}
            />
          </FieldRow>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Notes</SectionLabel>
          <TextField
            id="cfg-utils"
            labelText="Utilities (comma-sep)"
            value={(s.utilities ?? []).join(", ")}
            onFocus={api.checkpoint}
            onChange={(v) => live({ utilities: v.split(",").map((x) => x.trim()).filter(Boolean) })}
          />
          <TextAreaField id="cfg-notes" labelText="Notes" rows={3} value={s.notes ?? ""} onFocus={api.checkpoint} onChange={(v) => live({ notes: v })} />
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Connections</SectionLabel>
          <Footnote>Outgoing flows from this step:</Footnote>
          {outFlows.map((f, i) => (
            <Tile key={i} className="ak-row">
              <div className="ak-row__head">
                <span>→ {f.to}</span>
                <Button
                  kind="ghost"
                  className="fk-danger"
                  hasIconOnly
                  size="sm"
                  iconDescription={`Remove flow to ${f.to}`}
                  tooltipPosition="left"
                  renderIcon={TrashCan}
                  onClick={() => api.commit({ type: "REMOVE_FLOW", from: f.from, to: f.to })}
                />
              </div>
              <FieldRow>
                <NumberField
                  id={`flow-vol-${i}`}
                  label="Volume"
                  value={f.volume}
                  min={0}
                  onFocus={api.checkpoint}
                  onChange={(v) => api.live({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { volume: Number(v) || 0 } })}
                />
                <SelectField
                  id={`flow-transport-${i}`}
                  labelText="Transport"
                  value={f.transport}
                  options={TRANSPORT}
                  onChange={(v) => api.commit({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { transport: v as Flow["transport"] } })}
                />
              </FieldRow>
            </Tile>
          ))}
          <div className="fk-inline">
            <SelectField id="cfg-addflow" labelText="Add flow to…" value={addTo} onChange={setAddTo}>
              <SelectItem value="" text="Select a step…" disabled />
              {m.stations.filter((x) => x.id !== s.id).map((x) => (
                <SelectItem key={x.id} value={x.id} text={x.name} />
              ))}
            </SelectField>
            <Button size="sm" kind="secondary" renderIcon={Add} onClick={() => { if (addTo) { api.commit({ type: "ADD_FLOW", from: s.id, to: addTo }); setAddTo(""); } }}>
              Add
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
    <div className="pad">
      <div className="lab" style={{ marginBottom: 8 }}>
        Data model
      </div>
      <div style={{ fontSize: 11.5, color: TEXTD, marginBottom: 12, lineHeight: 1.5 }}>
        The whole layout is one JSON object. Export gives exactly this; Load expects it. Missing fields
        fill with defaults on import, and older files are migrated forward automatically.
      </div>
      <div style={{ fontSize: 11, marginBottom: 6 }}>
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
      <div style={{ fontSize: 11, marginBottom: 6 }}>
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
      <div style={{ fontSize: 11, marginBottom: 6 }}>
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
      <div style={{ fontSize: 10.5, color: TEXTD, lineHeight: 1.5 }}>
        Flow cost = Σ(volume × rectilinear-distance × unitCost). Chaining reads auto on both ends +
        transport: two auto steps with conveyor/agv = chained; with a manual handoff = auto-island.
      </div>
    </div>
  );
}
