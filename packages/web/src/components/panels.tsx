import { useMemo, useState } from "react";
import {
  Button,
  InlineNotification,
  MultiSelect,
  NumberInput,
  Select,
  SelectItem,
  Slider,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from "@carbon/react";
import { TrashCan } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { makeStation } from "@flowplan/core/store/reducer";
import { catalogFor } from "@flowplan/core/model/capabilities";
import { AUTO, CYCLE_KEYS, ERGO, MERGE_MODES, ROLES, SIDES, SPLIT_MODES, STATION_TYPES, TRANSPORT, ZONE_KINDS, attendedFractionOf, availabilityOf, fieldQuality, isFlowFunction, type CycleBreakdown, type DataQuality, type Flow, type RatingWeights, type Side, type Station, type StationDataField, type ZoneKind } from "@flowplan/core/model/types";
import type { CellForm } from "@flowplan/core/engine/templates";
import { WEIGHTS, normalizeWeights } from "@flowplan/core/engine/rating";
import { bottleneckAdvice } from "@flowplan/core/engine/balance";
import { CYCLE_LABELS, cycleAdvice, cycleAnalysis, seedBreakdown } from "@flowplan/core/engine/cycle";
import { findImprovements, type Improvement } from "@flowplan/core/engine/improve";
import { yieldAnalysis } from "@flowplan/core/engine/yield";
import { classifyFreedom, type FreedomFinding } from "@flowplan/core/engine/freedom";
import { openPoints } from "@flowplan/core/engine/openpoints";
import { guardrailCheck } from "@flowplan/core/engine/guardrails";
import { stationCells } from "@flowplan/core/engine/geometry";
import { autoPotential } from "@flowplan/core/engine/automation";
import { YamazumiChart } from "./charts";
import { AMBER, CYCLE_COL, LINE, PURPLE, RED, TEAL, TEALD, TEXTD, scoreColor } from "./colors";
import { HelpPopover, useToast } from "./ui";
import { QualitySelect } from "./confidence";
import type { CanvasMode } from "./LayoutCanvas";
import {
  deleteScenario,
  listScenarios,
  loadScenario,
  saveScenario,
} from "../store/scenarios";

export type Tab = "rating" | "balance" | "flow" | "auto" | "inspect" | "cost" | "chat" | "schema" | "workload" | "datasheet" | "capacity" | "portfolio" | "doc";

export interface PanelProps {
  api: FlowPlanApi;
  selId: string | null;
  setSel: (id: string | null) => void;
  setTab: (t: Tab) => void;
  setView: (v: "actual" | "split") => void;
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
  const letterCol = scoreColor(r.composite);
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
    <div className="pad">
      <Tile style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div
          style={{
            width: "3.5rem",
            height: "3.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.75rem",
            fontWeight: 300,
            border: "2px solid " + letterCol,
            color: letterCol,
          }}
        >
          {r.letter}
        </div>
        <div>
          <div className="lab">Actual-state rating</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 400 }}>
            {r.composite.toFixed(0)}
            <span style={{ fontSize: "0.875rem", color: TEXTD }}>/100</span>
          </div>
        </div>
      </Tile>
      {kpis.map(([lbl, val, sc], i) => {
        const col = scoreColor(sc);
        return (
          <div className="kpi" key={i}>
            <div className="kpiTop">
              <span style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
                {lbl}
                {KPI_HELP[lbl] ? <HelpPopover text={KPI_HELP[lbl]} /> : null}
              </span>
              <span>
                {val != null ? val.toFixed(0) + " · " : ""}
                <span style={{ color: col }}>{sc.toFixed(0)}</span>
              </span>
            </div>
            <div className="bar">
              <div style={{ width: sc + "%", background: col }} />
            </div>
          </div>
        );
      })}
      <OpenPointsSection api={api} setSel={setSel} setTab={setTab} />
      <ImprovementList api={api} setSel={setSel} setTab={setTab} setView={setView} />
      <div className="lab" style={{ marginBottom: 8 }}>
        Where the cost sits
      </div>
      {r.pareto.slice(0, 5).map((p, i) => (
        <div key={i} style={{ marginBottom: 7 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 2 }}>
            <span>{p.from + " → " + p.to}</span>
            <span>{p.share.toFixed(0)}%</span>
          </div>
          <div className="bar" style={{ height: 4 }}>
            <div style={{ width: p.share + "%", background: i === 0 ? RED : TEALD }} />
          </div>
        </div>
      ))}
      <WeightsEditor api={api} />
    </div>
  );
}


const IMPROVEMENT_COLOR: Record<Improvement["kind"], string> = {
  bottleneck: RED,
  rebalance: AMBER,
  waste: AMBER,
  relayout: TEAL,
  form: TEAL,
};

/**
 * Ranked improvement opportunities.
 *
 * Replaces the old single "improvement potential" number, which only measured
 * position swaps. A generated cell is already placed in flow order, so that
 * number was always 0% — which read as "nothing can be improved" when it meant
 * "this one optimiser has nothing to do". This shows every axis instead.
 */
// Open points (blueprint §4.1): the release actions generated from the estimated
// flags — not typed by the user. Investment follows these numbers, so an
// estimated one is an action before release, not a detail.
export function OpenPointsSection({ api, setSel, setTab }: { api: FlowPlanApi; setSel: (id: string | null) => void; setTab: (t: Tab) => void }) {
  const points = useMemo(() => openPoints(api.model), [api.model]);
  if (points.length === 0) return null;
  return (
    <div style={{ margin: "6px 0 14px" }}>
      <div className="lab" style={{ marginBottom: 6, display: "flex", alignItems: "center" }}>
        Open points — {points.length}
        <HelpPopover text="Generated from the estimated numbers in the model, not typed. Each is an input to secure before investment release, because investment follows these figures." />
      </div>
      {points.map((p) => (
        <InlineNotification
          key={p.id}
          kind={p.severity === "block" ? "error" : "warning"}
          lowContrast
          hideCloseButton
          title={p.text}
          style={{ marginBottom: 6, cursor: p.ref ? "pointer" : "default", maxWidth: "none" }}
          onClick={() => {
            if (p.ref && api.model.stations.some((s) => s.id === p.ref)) {
              setSel(p.ref);
              setTab("inspect");
            }
          }}
        />
      ))}
    </div>
  );
}

export function ImprovementList({
  api,
  setSel,
  setTab,
  setView,
}: {
  api: FlowPlanApi;
  setSel: (id: string | null) => void;
  setTab: (t: Tab) => void;
  setView: (v: "actual" | "split") => void;
}) {
  const report = useMemo(() => findImprovements(api.model), [api.model]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="lab" style={{ marginBottom: 8 }}>
        What could be better
        <HelpPopover text="Ranked across every axis the engine can see: line balance, the constraint, waste content, station positions and cell form. Throughput gains outrank labour gains, which outrank shorter travel." />
      </div>

      {report.exhausted ? (
        <InlineNotification kind="success" lowContrast hideCloseButton title="No headroom found." style={{ maxWidth: "none" }}>
          <div style={{ marginTop: 4, color: TEXTD }}>{report.why}</div>
        </InlineNotification>
      ) : (
        report.improvements.slice(0, 6).map((imp: Improvement, i: number) => (
          <Tile
            key={imp.kind + i}
            style={{ borderLeft: "3px solid " + IMPROVEMENT_COLOR[imp.kind], cursor: imp.targetIds.length ? "pointer" : "default", marginBottom: 8 }}
            onClick={() => {
              if (imp.kind === "relayout") setView("split");
              else if (imp.targetIds[0]) {
                setSel(imp.targetIds[0]);
                setTab("inspect");
              }
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <b style={{ fontSize: "0.75rem" }}>{imp.title}</b>
              <span style={{ fontSize: "0.75rem", color: TEXTD, whiteSpace: "nowrap" }}>
                {imp.confidence} conf.
              </span>
            </div>
            <div style={{ fontSize: "0.75rem", color: TEXTD, lineHeight: 1.5 }}>{imp.detail}</div>
          </Tile>
        ))
      )}

      <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 6 }}>
        Balance loss {report.balanceLossPct}%{report.taktSec > 0 ? ` · takt ${report.taktSec}s` : ""} · {report.lineOut.toLocaleString("en-US")}/shift
      </div>
    </div>
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
  return (
    <div style={{ marginTop: 14 }}>
      <Button kind="tertiary" size="sm" style={{ width: "100%", maxWidth: "none" }} onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Adjust KPI weights{custom ? " (custom)" : ""}
      </Button>
      {open ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: "0.75rem", color: TEXTD, marginBottom: 8 }}>
            Re-weight the composite to match your priorities. Values are normalized to 100%; the grade updates live.
          </div>
          {WEIGHT_LABELS.map(([key, label]) => (
            <div key={key} style={{ marginBottom: 8 }} onPointerDown={api.checkpoint}>
              <Slider
                labelText={
                  <span style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <span>{label}</span>
                    <span style={{ color: TEAL }}>{(w[key] * 100).toFixed(0)}%</span>
                  </span>
                }
                hideTextInput
                min={0}
                max={0.5}
                step={0.01}
                value={w[key]}
                onChange={({ value }) => api.live({ type: "SET_WEIGHTS", weights: { ...w, [key]: value } })}
              />
            </div>
          ))}
          {custom ? (
            <Button kind="tertiary" size="sm" style={{ width: "100%", maxWidth: "none" }} onClick={() => api.commit({ type: "SET_WEIGHTS", weights: undefined })}>
              Reset to defaults
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function BalancePanel({ api, setSel, setTab }: PanelProps) {
  const bal = api.rating.balance;
  const advice = bottleneckAdvice(bal, api.model.stations);
  const maxRate = bal.maxRate || 1;
  return (
    <div className="pad">
      <div className="lab" style={{ marginBottom: 8 }}>
        Line balance & bottleneck
      </div>
      <div className="imp" style={{ marginTop: 0 }}>
        <div className="lab">Line output (constrained by bottleneck)</div>
        <div className="impVal">
          {bal.lineOut.toLocaleString()} <span style={{ fontSize: "0.75rem", color: TEXTD, fontWeight: 400 }}>parts/shift</span>
        </div>
        <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 4 }}>
          Line pace ≈ {bal.lineCycleSec} s/part{bal.takt > 0 ? ` · customer takt ${bal.takt}s` : " · takt —"} · balance score {bal.score}/100
        </div>
      </div>
      {advice.length > 0 ? (
        <InlineNotification kind="error" lowContrast hideCloseButton title="How to lift the constraint" style={{ cursor: bal.bottleneck ? "pointer" : "default", maxWidth: "none" }} onClick={() => bal.bottleneck && (setSel(bal.bottleneck.id), setTab("inspect"))}>
          {advice.map((t, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              · {t}
            </div>
          ))}
        </InlineNotification>
      ) : null}
      <div className="lab" style={{ margin: "14px 0 8px" }}>
        Throughput per step (util % vs line)
      </div>
      {bal.steps.map((x) => {
        const isBn = bal.bottleneck && x.id === bal.bottleneck.id;
        const col = isBn ? RED : x.util >= 85 ? AMBER : TEAL;
        return (
          <div key={x.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 2 }}>
              <span>{x.name + (isBn ? " ◀ bottleneck" : "")}</span>
              <span style={{ color: col }}>{x.rate.toLocaleString() + "/sh · " + x.util + "%"}</span>
            </div>
            <div className="bar">
              <div style={{ width: Math.round((x.rate / maxRate) * 100) + "%", background: col }} />
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 8, lineHeight: 1.5 }}>
        Rate = min(3600/cycle × shift-hours × operators, capacity/shift) × parallel units. Low-util
        steps are starved by the bottleneck — that's spare capacity, not a problem to fix.
      </div>
      <CycleSection api={api} setSel={setSel} setTab={setTab} />
      <ParallelSection api={api} setSel={setSel} setTab={setTab} />
      <OperatorLoopSection api={api} setSel={setSel} setTab={setTab} />
      <YieldSection api={api} />
      <FreedomSection api={api} setTab={setTab} />
      <GuardrailSection api={api} setSel={setSel} setTab={setTab} />
    </div>
  );
}

// Operator loops & walk time (audit C-13). An operator tending several stations
// walks between them; that walk is waste computed from the layout. Shows the
// operator-balance (work vs walk) against takt — the lean standardized-work view.
function OperatorLoopSection({ api, setSel, setTab }: { api: FlowPlanApi; setSel: (id: string | null) => void; setTab: (t: Tab) => void }) {
  const ol = api.operatorLoops;
  if (ol.loops.length === 0) return null;
  const takt = ol.takt;
  const scale = Math.max(takt, ...ol.loops.map((l) => l.loopSec), 1);
  return (
    <div style={{ marginTop: 18 }}>
      <div className="lab" style={{ marginBottom: 6 }}>
        Operator loops & walk time
        <HelpPopover text="An operator tending several stations walks between them — a chaku-chaku loop. The walk is waste computed from the layout (rectilinear distance ÷ walk speed). Work + walk = the operator's time per part; over takt means one operator can't keep up. Assign an operator id per station in Configure to model explicit loops." />
      </div>
      {ol.notional ? (
        <div style={{ fontSize: "0.75rem", color: TEXTD, marginBottom: 8 }}>
          No operators assigned — showing one notional loop over the whole line (a layout walking-waste indicator). Set an <em>operator loop id</em> per station in Configure to model real loops.
        </div>
      ) : null}
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginBottom: 8 }}>
        {ol.operatorCount} loop{ol.operatorCount === 1 ? "" : "s"} · walking waste <strong style={{ color: ol.walkWastePct > 15 ? AMBER : "var(--cds-text-primary)" }}>{ol.walkWastePct.toFixed(0)}%</strong> of operator time · walk speed {ol.walkSpeedMps} m/s
      </div>
      {ol.loops.map((l) => {
        const over = l.overTaktSec > 0;
        return (
          <div key={l.id} style={{ marginBottom: 8, cursor: l.stationIds[0] ? "pointer" : "default" }} onClick={() => { if (l.stationIds[0]) { setSel(l.stationIds[0]); setTab("inspect"); } }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
              <span style={{ color: over ? RED : "var(--cds-text-primary)" }}>{l.synthetic ? "Line (notional)" : l.id} · {l.stationNames.length} station{l.stationNames.length === 1 ? "" : "s"}</span>
              <span style={{ color: TEXTD }}>{l.loopSec.toFixed(1)}s{takt > 0 ? ` / ${takt.toFixed(1)}s takt` : ""} · {l.walkMeters.toFixed(0)} m</span>
            </div>
            {/* work (teal) + walk (amber) stacked bar, with a takt line */}
            <div style={{ position: "relative", height: 10, background: LINE, marginTop: 3 }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(l.workSec / scale) * 100}%`, background: TEAL }} title={`work ${l.workSec.toFixed(1)}s`} />
              <div style={{ position: "absolute", left: `${(l.workSec / scale) * 100}%`, top: 0, height: "100%", width: `${(l.walkSec / scale) * 100}%`, background: AMBER }} title={`walk ${l.walkSec.toFixed(1)}s`} />
              {takt > 0 ? <div style={{ position: "absolute", left: `${Math.min(100, (takt / scale) * 100)}%`, top: -2, height: 14, width: 2, background: over ? RED : TEXTD }} title={`takt ${takt.toFixed(1)}s`} /> : null}
            </div>
            {over ? <div style={{ fontSize: "0.7rem", color: RED, marginTop: 2 }}>+{l.overTaktSec.toFixed(1)}s over takt — split the loop, shorten walks, or add an operator.</div> : null}
          </div>
        );
      })}
    </div>
  );
}

// Guardrail contract (blueprint §10). The four material paths and, above all,
// the good/reject separation the cell guarantees at its edges. Only shown once
// reject/rework paths are modelled.
function GuardrailSection({ api, setSel, setTab }: { api: FlowPlanApi; setSel: (id: string | null) => void; setTab: (t: Tab) => void }) {
  const findings = useMemo(() => guardrailCheck(api.model), [api.model]);
  const hasReject = api.model.flows.some((f) => (f.kind ?? "good") !== "good");
  if (!hasReject && findings.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="lab" style={{ marginBottom: 6, display: "flex", alignItems: "center" }}>
        Guardrails — four material paths
        <HelpPopover text="The cell's interface contract (blueprint §10). The separation is the guardrail: a reject must not be able to leave on the good-part route, ensured by geometry. NOK = red, RWK = amber dashed on the canvas." />
      </div>
      {findings.length === 0 ? (
        <InlineNotification kind="success" lowContrast hideCloseButton title="Good and reject paths are spatially separated — a mix-up is impossible by design." style={{ maxWidth: "none" }} />
      ) : (
        findings.map((f) => (
          <InlineNotification
            key={f.id}
            kind={f.severity === "error" ? "error" : "warning"}
            lowContrast
            hideCloseButton
            title={f.message}
            style={{ marginBottom: 6, cursor: f.stationId ? "pointer" : "default", maxWidth: "none" }}
            onClick={() => { if (f.stationId) { setSel(f.stationId); setTab("inspect"); } }}
          />
        ))
      )}
    </div>
  );
}

// Freedom-finding (blueprint §4.8). A linear routing implies an order that
// mostly does not exist; this surfaces which operations the balancer may move to
// fill an under-loaded station. Only meaningful once a workload is present.
const FREEDOM_COL: Record<FreedomFinding, string> = { free: TEAL, swappable: AMBER, exclusive: PURPLE, compulsory: TEXTD };
const FREEDOM_HELP =
  "A numbered routing implies a compulsory sequence that mostly does not exist. free = depends only on an early step, place it anywhere with slack (this is the balancing gain to look for). swappable = shares a predecessor with a sibling, either order works. exclusive = never runs in the same mode as another op, so they can share a station. compulsory = genuine physical precedence.";
function FreedomSection({ api, setTab }: { api: FlowPlanApi; setTab: (t: Tab) => void }) {
  const els = api.model.workElements ?? [];
  const fr = useMemo(() => classifyFreedom(els, api.model.variantModes), [els, api.model.variantModes]);
  if (els.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="lab" style={{ marginBottom: 6, display: "flex", alignItems: "center" }}>
        Placement freedom
        <HelpPopover text={FREEDOM_HELP} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: "0.75rem", marginBottom: 8 }}>
        {(["free", "swappable", "exclusive", "compulsory"] as FreedomFinding[]).map((k) =>
          fr.counts[k] > 0 ? (
            <span key={k} style={{ color: FREEDOM_COL[k] }}>
              {fr.counts[k]} {k}
            </span>
          ) : null,
        )}
      </div>
      <table className="schemaTbl">
        <tbody>
          {fr.elements.map((e) => (
            <tr key={e.elementId}>
              <td style={{ width: "1%", whiteSpace: "nowrap" }}>
                <span style={{ color: FREEDOM_COL[e.finding], fontWeight: 600 }}>{e.finding}</span>
              </td>
              <td>
                <div>{e.name}</div>
                <div style={{ fontSize: "0.75rem", color: TEXTD }}>{e.reason}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {fr.counts.free > 0 ? (
        <div style={{ fontSize: "0.75rem", color: TEAL, marginTop: 4, cursor: "pointer" }} onClick={() => setTab("workload")}>
          {fr.counts.free} free operation{fr.counts.free === 1 ? "" : "s"} can fill an under-loaded station →
        </div>
      ) : null}
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
    <>
      <div className="lab" style={{ margin: "18px 0 8px" }}>
        Value add vs waste
        <HelpPopover text="Cycle time split into value-add plus four waste classes. Only decomposed steps count toward the line ratio — undecomposed steps show hatched and are excluded." />
      </div>

      {analysis.decomposedCount === 0 ? (
        <div style={{ fontSize: "0.75rem", color: TEXTD, lineHeight: 1.6 }}>
          No step has a cycle breakdown yet. Select a step → Inspect → <b>Decompose</b> to split its
          cycle into value-add, handling, walk, wait and setup. The line ratio and waste backlog
          appear once at least one step is split.
        </div>
      ) : (
        <>
          <div className="imp" style={{ marginTop: 0 }}>
            <div className="lab">Value-add ratio{analysis.complete ? "" : " (decomposed steps only)"}</div>
            <div className="impVal">
              {analysis.lineValueAddPct}
              <span style={{ fontSize: "0.75rem", color: TEXTD, fontWeight: 400 }}>%</span>
            </div>
            <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 4 }}>
              {analysis.lineValueAddSec}s value-add · {analysis.lineNonValueAddSec}s waste ·{" "}
              {analysis.decomposedCount}/{analysis.totalCount} steps split
            </div>
          </div>

          <YamazumiChart rows={analysis.stations} takt={takt} onSelect={open} />

          <div className="legend">
            {CYCLE_KEYS.map((k) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, background: CYCLE_COL[k], borderRadius: 0, display: "inline-block" }} />
                {CYCLE_LABELS[k]}
              </span>
            ))}
          </div>

          {tips.length > 0 ? (
            <InlineNotification kind="warning" lowContrast hideCloseButton title="Where the waste is" style={{ marginTop: 12, maxWidth: "none" }}>
              {tips.map((t, i) => (
                <div key={i} style={{ marginBottom: 3 }}>
                  · {t}
                </div>
              ))}
            </InlineNotification>
          ) : null}

          {analysis.waste.length > 0 ? (
            <>
              <div className="lab" style={{ margin: "14px 0 8px" }}>
                Waste backlog (largest first)
              </div>
              {analysis.waste.slice(0, 6).map((wst, i) => (
                <div key={wst.stationId + wst.key + i} style={{ marginBottom: 8, cursor: "pointer" }} onClick={() => open(wst.stationId)}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 2 }}>
                    <span>
                      {wst.stationName} · <span style={{ color: CYCLE_COL[wst.key] }}>{wst.label.toLowerCase()}</span>
                    </span>
                    <span style={{ color: TEXTD }}>
                      {wst.sec}s · {wst.sharePct}%
                    </span>
                  </div>
                  <div className="bar">
                    <div style={{ width: wst.sharePct + "%", background: CYCLE_COL[wst.key] }} />
                  </div>
                </div>
              ))}
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function ParallelSection({ api, setSel, setTab }: { api: FlowPlanApi; setSel: (id: string | null) => void; setTab: (t: Tab) => void }) {
  const bal = api.rating.balance;
  const byId: Record<string, string> = {};
  api.model.stations.forEach((s) => (byId[s.id] = s.name));
  const path = bal.criticalPath.filter((id) => byId[id]);
  return (
    <div>
      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Critical path
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 6 }}>
        {path.length === 0 ? (
          <span style={{ fontSize: "0.75rem", color: TEXTD }}>—</span>
        ) : (
          path.map((id, i) => (
            <span key={id} style={{ display: "inline-flex", alignItems: "center" }}>
              <Tag type="teal" style={{ cursor: "pointer" }} onClick={() => { setSel(id); setTab("inspect"); }}>
                {byId[id]}
              </Tag>
              {i < path.length - 1 ? <span style={{ color: TEXTD, margin: "0 2px" }}>→</span> : null}
            </span>
          ))
        )}
      </div>
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginBottom: 4 }}>The longest cumulative-cycle route — the sequence that sets the line's pace.</div>

      {bal.syncWaits.length > 0 ? (
        <>
          <div className="lab" style={{ margin: "14px 0 8px" }}>
            Merge synchronization
          </div>
          {bal.syncWaits.map((sw) => (
            <InlineNotification
              key={sw.mergeId}
              kind="warning"
              lowContrast
              hideCloseButton
              title={`${sw.mergeName}: paced by ${sw.bindingName} at ${sw.bindingRate.toLocaleString()}/sh`}
              style={{ cursor: "pointer", maxWidth: "none" }}
              onClick={() => { setSel(sw.mergeId); setTab("inspect"); }}
            >
              {sw.waiters.map((w) => (
                <div key={w.id} style={{ fontSize: "0.75rem" }}>
                  · {w.name} idles ~{w.idle.toLocaleString()}/sh — add a ≈{w.buffer.toLocaleString()}-part buffer to decouple.
                </div>
              ))}
            </InlineNotification>
          ))}
        </>
      ) : null}
    </div>
  );
}

function YieldSection({ api }: { api: FlowPlanApi }) {
  const y = yieldAnalysis(api.model.stations, api.model.flows);
  const withScrap = y.steps.filter((s) => s.scrapRate > 0);
  return (
    <div>
      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Yield &amp; scrap
      </div>
      <div className="imp" style={{ marginTop: 0 }}>
        <div className="lab">Rolled throughput yield</div>
        <div className="impVal">
          {y.rolledYield}% <span style={{ fontSize: "0.75rem", color: TEXTD, fontWeight: 400 }}>good parts</span>
        </div>
        <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 4 }}>≈ {y.totalScrap.toLocaleString()} scrap parts/shift across the line</div>
      </div>
      {withScrap.length === 0 ? (
        <div style={{ fontSize: "0.75rem", color: TEXTD }}>Set a scrap rate per step in Configure to see where yield is lost.</div>
      ) : (
        withScrap.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 4 }}>
            <span>{s.name}</span>
            <span style={{ color: RED }}>
              {Math.round(s.scrapRate * 100)}% · {Math.round(s.scrapUnits).toLocaleString()}/sh
            </span>
          </div>
        ))
      )}
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 6, lineHeight: 1.5 }}>
        Rolled yield = ∏(1 − scrap rate) over process steps. Informational — it doesn't change the
        composite grade.
      </div>
    </div>
  );
}

function ScenarioSection({ api }: { api: FlowPlanApi }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [tick, setTick] = useState(0);
  const scenarios = listScenarios();
  return (
    <div>
      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Scenarios (compare variants)
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-end" }}>
        <TextInput id="scenario-name" labelText="" hideLabel placeholder="name this variant…" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          kind="tertiary"
          size="sm"
          onClick={() => {
            const n = name.trim() || api.model.name || "Variant";
            saveScenario(n, api.model);
            setName("");
            setTick((t) => t + 1);
            toast("Saved scenario “" + n + "”");
          }}
        >
          Save
        </Button>
      </div>
      {scenarios.length === 0 ? (
        <div style={{ fontSize: "0.75rem", color: TEXTD }}>Save the current layout as a named variant to compare alternatives.</div>
      ) : (
        scenarios.map((s) => (
          <div key={s.name + tick} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, fontSize: "0.75rem" }}>
            <Button kind="tertiary" size="sm" style={{ flex: 1, maxWidth: "none", justifyContent: "flex-start" }} onClick={() => { const m = loadScenario(s.name); if (m) { api.reset(m); toast("Loaded “" + s.name + "”"); } }}>
              {s.name}
            </Button>
            <Button kind="danger--tertiary" size="sm" aria-label={"Delete " + s.name} style={{ marginLeft: 6 }} onClick={() => { deleteScenario(s.name); setTick((t) => t + 1); }}>
              <TrashCan />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

function LayoutSettings({ api }: { api: FlowPlanApi }) {
  const { toast } = useToast();
  const m = api.model;
  return (
    <div>
      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Layout settings
      </div>
      <TextInput id="ls-name" labelText="Cell name" value={m.name} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "SET_NAME", name: e.target.value })} />
      <div className="row2" style={{ marginTop: 8 }}>
        <NumberInput id="ls-gridw" label="Grid width" helperText="Stations are re-clamped inside the grid when you shrink it." value={m.gridW} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "SET_GRID", gridW: +value, gridH: m.gridH })} />
        <NumberInput id="ls-gridh" label="Grid height" value={m.gridH} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "SET_GRID", gridW: m.gridW, gridH: +value })} />
      </div>
      <div style={{ marginTop: 8 }}>
        <NumberInput id="ls-shift" label="Shift length (hours)" helperText="Used by the balance model for throughput. Stations can override this individually in Configure." value={m.shiftHours ?? 8} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "SET_SHIFT_HOURS", shiftHours: +value })} />
      </div>
      {/* Floor-load capacity (audit C-03) — with per-station weight it flags a
          station too heavy for the slab. 0/blank ⇒ the check is skipped. */}
      <div style={{ marginTop: 8 }}>
        <NumberInput id="ls-floorload" label="Floor load capacity (kg/m²)" helperText="Slab capacity. A station whose weight ÷ footprint exceeds this is flagged in Flow ▸ Layout realism. 0 = not checked." min={0} value={m.floorLoadKgPerM2 ?? 0} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "SET_FLOOR_LOAD", floorLoadKgPerM2: +value > 0 ? +value : undefined })} />
      </div>
      {/* Floor envelope polygon (audit C-03 inc2). "Fit" seeds it to the current
          layout's bounding box; then it can be reshaped by editing the model JSON
          (a full on-canvas polygon editor is a later increment). Stations off the
          floor are flagged and the optimiser keeps them inside it. */}
      <div style={{ marginTop: 12 }}>
        <div className="lab" style={{ marginBottom: 6 }}>Floor envelope</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button
            kind="tertiary"
            size="sm"
            onClick={() => {
              const ss = m.stations.filter((s) => s.w > 0 && s.h > 0);
              if (ss.length === 0) { toast("Add stations first", "err"); return; }
              const minX = Math.max(0, Math.min(...ss.map((s) => s.x)) - 1);
              const minY = Math.max(0, Math.min(...ss.map((s) => s.y)) - 1);
              const maxX = Math.min(m.gridW, Math.max(...ss.map((s) => s.x + s.w)) + 1);
              const maxY = Math.min(m.gridH, Math.max(...ss.map((s) => s.y + s.h)) + 1);
              api.commit({ type: "SET_FLOOR_POLYGON", floorPolygon: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]] });
              toast("Floor fitted to layout");
            }}
          >
            Fit floor to layout
          </Button>
          <Button kind="ghost" size="sm" disabled={!m.floorPolygon} onClick={() => { api.commit({ type: "SET_FLOOR_POLYGON", floorPolygon: undefined }); toast("Floor envelope cleared"); }}>
            Clear
          </Button>
        </div>
        <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 6 }}>
          {m.floorPolygon ? `${m.floorPolygon.length}-point envelope. Stations leaving it are flagged in Flow ▸ Layout realism.` : "No envelope — the full grid is usable floor."}
        </div>
      </div>
    </div>
  );
}

function NoGoSection({ api, mode, setMode }: { api: FlowPlanApi; mode: CanvasMode; setMode: (m: CanvasMode) => void }) {
  return (
    <div>
      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Zones — reserved &amp; blocked space
      </div>
      <Button kind={mode === "nogo" ? "primary" : "tertiary"} size="sm" onClick={() => setMode(mode === "nogo" ? "select" : "nogo")}>
        {mode === "nogo" ? "Drawing… (click to stop)" : "Draw a blocking area"}
      </Button>
      <div style={{ fontSize: "0.75rem", color: TEXTD, margin: "6px 0" }}>
        Drag a rectangle for a blocking area, or drop a Spacer / Aisle / Wall / Column / ESD from the library palette.
        Blocking, wall and column obstruct placement; spacer, aisle and ESD reserve floor space.
      </div>
      {(api.model.noGoZones ?? []).map((z, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6, fontSize: "0.75rem" }}>
          <div style={{ flex: "0 0 auto" }}>
            <Select
              id={`nogo-kind-${i}`}
              labelText={`Zone ${i + 1} kind`}
              hideLabel
              size="sm"
              value={z.kind ?? "blocking"}
              onChange={(e) => api.commit({ type: "UPDATE_NOGO", index: i, patch: { kind: e.target.value as ZoneKind } })}
            >
              {ZONE_KINDS.map((k) => <SelectItem key={k} value={k} text={k} />)}
            </Select>
          </div>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <TextInput
              id={`nogo-label-${i}`}
              labelText={`Zone ${i + 1} label`}
              hideLabel
              size="sm"
              value={z.label ?? ""}
              placeholder="label"
              onChange={(e) => api.commit({ type: "UPDATE_NOGO", index: i, patch: { label: e.target.value || undefined } })}
            />
          </div>
          <span style={{ color: TEXTD, whiteSpace: "nowrap" }}>{z.w}×{z.h}</span>
          <Button kind="danger--tertiary" size="sm" aria-label={`Remove zone ${i + 1}`} onClick={() => api.commit({ type: "REMOVE_NOGO", index: i })}>
            <TrashCan />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function FlowPanel({ api, setSel, setTab, mode, setMode }: PanelProps) {
  const { toast } = useToast();
  const v = api.validation;
  const errCount = v.issues.filter((i) => i.sev === "err").length;
  return (
    <div className="pad">
      <InlineNotification
        kind={v.valid ? "success" : "error"}
        lowContrast
        hideCloseButton
        title={v.valid ? "Process flow is valid — every step connects input→output." : errCount + " blocking issue(s) found."}
        style={{ marginBottom: 12, maxWidth: "none" }}
      />
      <div className="lab" style={{ marginBottom: 8 }}>
        Validation
      </div>
      {v.issues.length === 0 ? <div style={{ fontSize: "0.75rem", color: TEXTD }}>No dead ends, orphans, or unreachable steps.</div> : null}
      {v.issues.map((it, i) => (
        <InlineNotification
          key={i}
          kind={it.sev === "err" ? "error" : "warning"}
          lowContrast
          hideCloseButton
          title={it.msg}
          style={{ cursor: it.id ? "pointer" : "default", maxWidth: "none" }}
          onClick={() => { if (it.id) { setSel(it.id); setTab("inspect"); } }}
        />
      ))}

      {/* Layout realism (audit C-03): clearance, floor load, egress — the checks
          that decide whether a layout is buildable, not just cheap to flow. Only
          shown when the model carries the data (clearance/weight/floor capacity). */}
      {api.realism.issues.length > 0 ? (
        <>
          <div className="lab" style={{ margin: "16px 0 8px" }}>Layout realism</div>
          {api.realism.issues.map((it, i) => (
            <InlineNotification
              key={i}
              kind={it.sev === "err" ? "error" : "warning"}
              lowContrast
              hideCloseButton
              title={it.msg}
              style={{ cursor: it.id ? "pointer" : "default", maxWidth: "none" }}
              onClick={() => { if (it.id) { setSel(it.id); setTab("inspect"); } }}
            />
          ))}
        </>
      ) : null}

      {/* Capability coverage — Gate 1 (audit C-01): can this workload be produced
          on this line's resources? Direct, via a substitution, or a blocker. */}
      {!api.coverage.empty ? (
        <>
          <div className="lab" style={{ margin: "16px 0 8px" }}>
            Capability coverage (Gate 1)
          </div>
          <InlineNotification
            kind={api.coverage.gate1Pass ? "success" : "error"}
            lowContrast
            hideCloseButton
            title={api.coverage.gate1Pass
              ? `All ${api.coverage.required.length} required capabilities are covered${api.coverage.alternative > 0 ? ` (${api.coverage.alternative} via a substitute)` : ""}.`
              : `${api.coverage.missing} capability(ies) not provided — the line cannot make this workload as-is.`}
            style={{ marginBottom: 8, maxWidth: "none" }}
          />
          {api.coverage.required.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "2px 0", color: TEXTD }}>
              <span style={{ color: c.status === "missing" ? RED : "var(--cds-text-primary)" }}>{c.name}</span>
              <span style={{ color: c.status === "covered" ? TEAL : c.status === "alternative" ? AMBER : RED }}>
                {c.status === "covered" ? "provided" : c.status === "alternative" ? `via ${c.viaName}` : "MISSING"}
              </span>
            </div>
          ))}
        </>
      ) : null}

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Draw connections
      </div>
      <Button kind={mode === "flow" ? "primary" : "tertiary"} size="sm" onClick={() => setMode(mode === "flow" ? "select" : "flow")}>
        {mode === "flow" ? "Picking… tap source then target" : "Draw a flow on the canvas"}
      </Button>

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Cell form templates
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {(["I", "U", "L", "S"] as CellForm[]).map((fm) => (
          <Button key={fm} kind="tertiary" size="sm" onClick={() => { api.commit({ type: "APPLY_TEMPLATE", form: fm }); toast(fm + "-shape applied"); }}>
            {fm}-shape
          </Button>
        ))}
      </div>
      <div style={{ fontSize: "0.75rem", color: TEXTD }}>Arranges movable process steps along the chosen form. Fixed and I/O stations stay put.</div>

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Add a step
      </div>
      <Button
        kind="tertiary"
        style={{ width: "100%", maxWidth: "none" }}
        onClick={() => {
          const ns = makeStation(api.model);
          api.commit({ type: "ADD_STATION", station: ns });
          setSel(ns.id);
          setTab("inspect");
        }}
      >
        + Add process step
      </Button>

      <LayoutSettings api={api} />
      <NoGoSection api={api} mode={mode} setMode={setMode} />
      <ScenarioSection api={api} />
    </div>
  );
}

export function AutomationPanel({ api, setSel, setTab }: PanelProps) {
  const chain = api.chain;
  return (
    <div className="pad">
      <div className="lab" style={{ marginBottom: 8 }}>
        Automation chaining
      </div>
      <InlineNotification
        kind={chain.islands > 0 ? "warning" : "success"}
        lowContrast
        hideCloseButton
        title={chain.islands > 0 ? chain.islands + " auto-island(s): two automated steps joined by a manual handoff — prime to chain." : "No broken automation chains detected."}
        style={{ marginBottom: 12, maxWidth: "none" }}
      />
      {chain.links.map((l, i) => {
        const col = l.kind === "auto-island" ? RED : l.kind === "chained-auto" ? TEAL : l.kind === "mixed" ? AMBER : TEXTD;
        return (
          <Tile key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem" }}>{l.from + " → " + l.to}</span>
              <Tag type="gray" style={{ color: col }}>
                {l.kind}
              </Tag>
            </div>
            <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 3 }}>via {l.transport}</div>
          </Tile>
        );
      })}
      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Automation potential per step
      </div>
      {api.model.stations
        .filter((s) => s.role === "process")
        .map((s) => {
          const ap = autoPotential(s);
          const col = scoreColor(ap.pct);
          return (
            <Tile key={s.id} style={{ cursor: "pointer", marginBottom: 8 }} onClick={() => { setSel(s.id); setTab("inspect"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.75rem" }}>{s.name}</span>
                <span style={{ color: col, fontSize: "0.75rem" }}>{ap.verdict + " · " + ap.pct.toFixed(0)}</span>
              </div>
              <div className="bar">
                <div style={{ width: ap.pct + "%", background: col }} />
              </div>
              <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 4 }}>
                currently {s.auto} · {ap.src === "override" ? "manual override" : "heuristic"}
              </div>
            </Tile>
          );
        })}
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 6 }}>
        Heuristic weighs type, ergonomics, cycle time, changeover, volume, labor — an opinion, not a
        validated ROI model. Override per step in Configure.
      </div>
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
    <label className="field">
      <span>Footprint shape {isRect ? "(rectangle)" : "(custom)"}</span>
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
                  style={{ width: 16, height: 16, padding: 0, borderRadius: 0, border: "1px solid " + LINE, background: on ? TEAL : "transparent", cursor: "pointer" }}
                />
              );
            }),
          )}
        </div>
        <Button kind="tertiary" size="sm" onClick={() => api.commit({ type: "UPDATE_STATION", id: station.id, patch: { cells: undefined } })}>
          Fill (rect)
        </Button>
      </div>
    </label>
  );
}

export function ConfigurePanel({ api, selId, setSel }: PanelProps) {
  const { toast } = useToast();
  const m = api.model;
  const s = m.stations.find((x) => x.id === selId);
  const [renameVal, setRenameVal] = useState("");
  const [addTo, setAddTo] = useState("");
  const [showAdv, setShowAdv] = useState(false);
  if (!s) {
    return (
      <div className="pad">
        <div style={{ color: TEXTD, fontSize: "0.75rem" }}>
          Tap a station on the layout (or in the Automation/Flow lists) to configure it. Use Flow ▸ Add
          a step to create new ones.
        </div>
      </div>
    );
  }
  const outFlows = m.flows.filter((f) => f.from === s.id);
  const inCount = m.flows.filter((f) => f.to === s.id).length;
  const up = (patch: Record<string, unknown>) => api.commit({ type: "UPDATE_STATION", id: s.id, patch });
  // Provenance (spec §5): each investment-driving number carries a data-quality
  // flag. `up` merges shallowly, so pass the whole dataQuality object.
  const setQuality = (field: StationDataField, q: DataQuality) =>
    up({ dataQuality: { ...s.dataQuality, [field]: q } });
  const qAside = (field: StationDataField) => (
    <QualitySelect value={fieldQuality(s, field)} onChange={(q) => setQuality(field, q)} />
  );
  const estClass = (field: StationDataField) => (fieldQuality(s, field) === "estimated" ? "est-field" : undefined);
  return (
    <div className="pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="lab">Configure · {s.id}</div>
        <Button kind="danger--tertiary" size="sm" onClick={() => { api.commit({ type: "DELETE_STATION", id: s.id }); setSel(null); }}>
          Delete
        </Button>
      </div>
      {/* Essentials — the handful of fields a first pass needs. Everything else
          is one click away under Advanced, so this is no longer the app's
          densest screen. */}
      <TextInput id="cfg-name" labelText="Name" value={s.name} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { name: e.target.value } })} />
      <div className="row2" style={{ marginTop: 8 }}>
        <Select id="cfg-role" labelText="Role (I/O flexible)" value={s.role} onChange={(e) => up({ role: e.target.value })}>
          {ROLES.map((t) => (
            <SelectItem key={t} value={t} text={t} />
          ))}
        </Select>
        <Select id="cfg-type" labelText="Type" value={s.type} onChange={(e) => up({ type: e.target.value })}>
          {STATION_TYPES.map((t) => (
            <SelectItem key={t} value={t} text={t} />
          ))}
        </Select>
      </div>
      {isFlowFunction(s) ? (
        <>
          <div className="row2" style={{ marginTop: 8 }}>
            <NumberInput
              id="cfg-wip"
              label={<span>Buffer capacity (pieces)<HelpPopover text="WIP this buffer can hold to decouple its neighbours. A flow function holds material — it is not a work step, so it adds no cycle time, takt, balance load or operators." /></span>}
              value={s.bufferCapacity ?? 0}
              min={0}
              onFocus={api.checkpoint}
              onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { bufferCapacity: +value } })}
            />
            <NumberInput id="cfg-throughput" label={<span>Throughput/shift<HelpPopover text="Optional cap on parts/shift that can pass through. 0 = unlimited (a pure decoupling buffer)." /></span>} value={s.capacityPerShift} min={0} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { capacityPerShift: +value } })} />
          </div>
          <div className="field" style={{ marginTop: 6, color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>
            Flow function — decouples the flow and holds WIP; not a work step, so it never appears in the balance or Yamazumi.
          </div>
        </>
      ) : (
        <div className="row2" style={{ marginTop: 8 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <div style={{ position: "absolute", right: 0, top: 0, zIndex: 1 }}>{qAside("cycleTimeSec")}</div>
            <NumberInput
              id="cfg-cycle"
              className={estClass("cycleTimeSec")}
              label={
                <span>
                  Cycle time (s)
                  {s.cycle ? <HelpPopover text="Derived from the breakdown below — edit the components to change it." /> : null}
                </span>
              }
              value={s.cycleTimeSec}
              disabled={!!s.cycle}
              onFocus={api.checkpoint}
              onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { cycleTimeSec: +value } })}
            />
          </div>
          <NumberInput id="cfg-operators" label="Operators" value={s.operators} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { operators: +value } })} />
        </div>
      )}
      {!isFlowFunction(s) ? (
        <>
          <div className="row2" style={{ marginTop: 8 }}>
            <NumberInput
              id="cfg-parts-per-cycle"
              label={<span>Parts / cycle<HelpPopover text="Parts processed together in ONE cycle — a multi-cavity die, a fixture that holds several parts, a batch oven. Multiplies part throughput without adding a machine; the Yamazumi shows the per-part time (cycle ÷ this)." /></span>}
              value={s.partsPerCycle ?? 1}
              min={1}
              step={1}
              onFocus={api.checkpoint}
              onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { partsPerCycle: Math.max(1, Math.floor(+value || 1)) } })}
            />
            <NumberInput
              id="cfg-attended"
              label={<span className="field-lab-row">Operator-bound %<HelpPopover text="Share of the cycle that binds an operator (drives operator loops / walk balance). Blank uses a type default (manual 100%, quality 60%, machine 30%). A machine that only needs load/unload is low — the rest runs unattended." /></span>}
              helperText={s.attendedFraction == null ? `default ${Math.round(attendedFractionOf(s) * 100)}%` : undefined}
              allowEmpty
              min={0}
              max={100}
              value={s.attendedFraction == null ? "" : Math.round(s.attendedFraction * 100)}
              onFocus={api.checkpoint}
              onChange={(_: unknown, { value }: { value: number | string }) => up({ attendedFraction: value === "" ? undefined : Math.max(0, Math.min(100, +value)) / 100 })}
            />
          </div>
          <TextInput
            id="cfg-operatorid"
            labelText={<span className="field-lab-row">Operator loop id<HelpPopover text="Stations sharing an id are tended by one operator as a walking loop (chaku-chaku). Walk time between them is computed from the layout and shown in Balance ▸ Operator loops. Blank = not in an explicit loop." /></span>}
            value={s.operatorId ?? ""}
            onFocus={api.checkpoint}
            onChange={(e) => up({ operatorId: e.target.value.trim() === "" ? undefined : e.target.value.trim() })}
            style={{ marginTop: 8 }}
          />
          {/* Reliability (audit C-02): availability scales effective throughput. */}
          <NumberInput
            id="cfg-availability"
            label={<span className="field-lab-row">Availability %<HelpPopover text="Equipment uptime fraction — scales this step's effective output, so an unreliable machine can become the bottleneck. Blank = 100%, or derived from MTBF/MTTR below when both are set." /></span>}
            helperText={s.mtbfHours && s.mttrHours ? `from MTBF/MTTR: ${Math.round(availabilityOf(s) * 100)}%` : undefined}
            allowEmpty
            min={0}
            max={100}
            value={s.mtbfHours && s.mttrHours ? Math.round(availabilityOf(s) * 100) : s.availabilityPct == null ? "" : Math.round(s.availabilityPct * 100)}
            onFocus={api.checkpoint}
            onChange={(_: unknown, { value }: { value: number | string }) => up({ availabilityPct: value === "" ? undefined : Math.max(0, Math.min(100, +value)) / 100 })}
            style={{ marginTop: 8 }}
          />
          <div className="row2" style={{ marginTop: 8 }}>
            <NumberInput id="cfg-mtbf" label={<span className="field-lab-row">MTBF (h)<HelpPopover text="Mean time between failures. With MTTR it derives availability = MTBF ÷ (MTBF + MTTR)." /></span>} allowEmpty min={0} value={s.mtbfHours ?? ""} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => up({ mtbfHours: value === "" ? undefined : Math.max(0, +value) })} />
            <NumberInput id="cfg-mttr" label={<span className="field-lab-row">MTTR (h)<HelpPopover text="Mean time to repair. With MTBF it derives the availability used to scale effective capacity." /></span>} allowEmpty min={0} value={s.mttrHours ?? ""} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => up({ mttrHours: value === "" ? undefined : Math.max(0, +value) })} />
          </div>
          {/* Cycle-time variability (audit C-09): σ/μ drives the p50/p95/p99 view
              and the takt-attainment probability in Analysis. Blank = 0 = deterministic. */}
          <NumberInput
            id="cfg-cyclecv"
            label={<span className="field-lab-row">Cycle CV (σ/μ)<HelpPopover text="Coefficient of variation of the cycle time — its relative spread. Manual tasks ≈ 0.2–0.4, automated ≈ 0. Drives the p95 tail and the line's takt-attainment probability in Analysis. Blank = deterministic." /></span>}
            allowEmpty
            min={0}
            max={1}
            step={0.05}
            value={s.cycleCV == null ? "" : s.cycleCV}
            onFocus={api.checkpoint}
            onChange={(_: unknown, { value }: { value: number | string }) => up({ cycleCV: value === "" ? undefined : Math.max(0, Math.min(1, +value)) || undefined })}
            style={{ marginTop: 8 }}
          />
          {/* Capabilities this station provides (audit C-01/C-11) — the line's
              supply side of the part-number feasibility matrix. */}
          {(() => {
            const items = catalogFor(api.model).map((c) => ({ id: c.id, label: c.name }));
            const selected = items.filter((i) => (s.provides ?? []).includes(i.id));
            return (
              <div style={{ marginTop: 8 }}>
                <MultiSelect
                  id="cfg-provides"
                  size="sm"
                  titleText={<span className="field-lab-row">Provides (capabilities)<HelpPopover text="Capabilities this resource provides. This is the line's supply side of the Portfolio part-number feasibility matrix (Gate 1) — a part is runnable when every capability it needs is provided here or via a catalogued alternative." /></span>}
                  label={selected.length ? `${selected.length} capability(ies)` : "Select capabilities"}
                  items={items}
                  itemToString={(i: { id: string; label: string } | null) => (i ? i.label : "")}
                  selectedItems={selected}
                  onChange={({ selectedItems }: { selectedItems: { id: string; label: string }[] }) => up({ provides: selectedItems.length ? selectedItems.map((i) => i.id) : undefined })}
                />
              </div>
            );
          })()}
        </>
      ) : null}
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <div className="field"><span>Fixed / anchored</span></div>
        <Button kind={s.fixed ? "primary" : "tertiary"} style={{ width: "100%", maxWidth: "none" }} onClick={() => up({ fixed: !s.fixed })}>
          {s.fixed ? "FIXED — won't be moved" : "Movable"}
        </Button>
      </div>

      <Button
        kind="tertiary"
        size="sm"
        style={{ width: "100%", maxWidth: "none", justifyContent: "center", margin: "6px 0 4px" }}
        aria-expanded={showAdv}
        onClick={() => setShowAdv((v) => !v)}
      >
        {showAdv ? "▾ Hide advanced" : "▸ Advanced settings"}
      </Button>

      {showAdv ? (
      <>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <TextInput id="cfg-rename" labelText={<span className="field-lab-row">Station id (rename)<HelpPopover text="Renaming rewrites every flow that references this station." /></span>} placeholder={s.id} value={renameVal} onChange={(e) => setRenameVal(e.target.value)} />
        </div>
        <Button
          kind="tertiary"
          size="sm"
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
      <div className="row2" style={{ marginTop: 8 }}>
        <NumberInput id="cfg-w" label="Width" value={s.w} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { w: Math.max(1, +value) } })} />
        <NumberInput id="cfg-h" label="Height" value={s.h} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { h: Math.max(1, +value) } })} />
      </div>
      {/* Access clearance + weight (audit C-03) — feed the Layout-realism checks. */}
      {(() => {
        const c = s.clearance ?? { top: 0, right: 0, bottom: 0, left: 0 };
        const setClear = (k: "top" | "right" | "bottom" | "left", v: number) => {
          const next = { ...c, [k]: Math.max(0, Math.round(v || 0)) };
          const allZero = next.top === 0 && next.right === 0 && next.bottom === 0 && next.left === 0;
          up({ clearance: allZero ? undefined : next });
        };
        return (
          <>
            <div className="field-lab-row" style={{ fontSize: "0.75rem", marginTop: 10 }}>
              Access clearance (cells)
              <HelpPopover text="Keep-clear margin per side for operator/maintenance access. Another machine's body must not sit in it — violations show in Flow ▸ Layout realism and ring the station red. The optimiser respects it." />
            </div>
            <div className="row2" style={{ marginTop: 4 }}>
              <NumberInput id="cfg-cl-top" label="Top" min={0} value={c.top} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => setClear("top", +value)} />
              <NumberInput id="cfg-cl-bottom" label="Bottom" min={0} value={c.bottom} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => setClear("bottom", +value)} />
            </div>
            <div className="row2" style={{ marginTop: 4 }}>
              <NumberInput id="cfg-cl-left" label="Left" min={0} value={c.left} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => setClear("left", +value)} />
              <NumberInput id="cfg-cl-right" label="Right" min={0} value={c.right} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => setClear("right", +value)} />
            </div>
            <NumberInput id="cfg-weight" label={<span className="field-lab-row">Weight (kg)<HelpPopover text="Equipment weight. With the cell's floor-load capacity (Layout settings) it flags a station too heavy for the slab." /></span>} min={0} value={s.weightKg ?? 0} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => up({ weightKg: Math.max(0, +value) || undefined })} style={{ marginTop: 8 }} />
          </>
        );
      })()}
      <CellShapeEditor api={api} station={s} />
      <div className="row2" style={{ marginTop: 8 }}>
        <Select id="cfg-inside" labelText={<span className="field-lab-row">IN port<HelpPopover text="Edge where material enters; flows route to this port." /></span>} value={s.inSide ?? "left"} onChange={(e) => up({ inSide: e.target.value as Side })}>
          {SIDES.map((t) => (
            <SelectItem key={t} value={t} text={t} />
          ))}
        </Select>
        <Select id="cfg-outside" labelText={<span className="field-lab-row">OUT port<HelpPopover text="Edge where material exits." /></span>} value={s.outSide ?? "right"} onChange={(e) => up({ outSide: e.target.value as Side })}>
          {SIDES.map((t) => (
            <SelectItem key={t} value={t} text={t} />
          ))}
        </Select>
      </div>
      <div className="row2" style={{ marginTop: 8 }}>
        <Select id="cfg-scrapside" labelText="Scrap port" value={s.scrapSide ?? "bottom"} onChange={(e) => up({ scrapSide: e.target.value as Side })}>
          {SIDES.map((t) => (
            <SelectItem key={t} value={t} text={t} />
          ))}
        </Select>
        <NumberInput
          id="cfg-scraprate"
          label={<span className="field-lab-row">Scrap rate (%)<HelpPopover text="Share of incoming parts scrapped here. Shown in Balance ▸ Yield; not part of the grade." /></span>}
          min={0}
          max={100}
          value={Math.round((s.scrapRate ?? 0) * 100)}
          onFocus={api.checkpoint}
          onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { scrapRate: Math.max(0, Math.min(100, +value)) / 100 } })}
        />
      </div>
      <div className="row2" style={{ marginTop: 8 }}>
        <NumberInput
          id="cfg-parallel"
          label={<span className="field-lab-row">Parallel units (×N)<HelpPopover text="Identical resources running in parallel at this step. Capacity scales ×N." /></span>}
          min={1}
          value={s.parallelUnits ?? 1}
          onFocus={api.checkpoint}
          onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { parallelUnits: Math.max(1, Math.round(+value)) } })}
        />
        {outFlows.length > 1 ? (
          <Select id="cfg-split" labelText={<span className="field-lab-row">Split mode<HelpPopover text="distribute = volume splits by share across lanes; fork = each branch gets full part count (distinct components)." /></span>} value={s.splitMode ?? "distribute"} onChange={(e) => up({ splitMode: e.target.value })}>
            {SPLIT_MODES.map((t) => (
              <SelectItem key={t} value={t} text={t} />
            ))}
          </Select>
        ) : (
          <div style={{ flex: 1 }} />
        )}
      </div>
      {inCount > 1 ? (
        <div style={{ marginTop: 8 }}>
          <Select id="cfg-merge" labelText={<span className="field-lab-row">Merge mode<HelpPopover text="sum = inbound rates add; assemble = synchronized, needs one of each input (rate = slowest feeder)." /></span>} value={s.mergeMode ?? "sum"} onChange={(e) => up({ mergeMode: e.target.value })}>
            {MERGE_MODES.map((t) => (
              <SelectItem key={t} value={t} text={t} />
            ))}
          </Select>
        </div>
      ) : null}
      <div className="row2" style={{ marginTop: 8 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <div style={{ position: "absolute", right: 0, top: 0, zIndex: 1 }}>{qAside("capex")}</div>
          <NumberInput id="cfg-capex" className={estClass("capex")} label={<span>Equipment capex<HelpPopover text="One-time cost of this step's equipment (Cost tab)." /></span>} min={0} value={s.capex ?? 0} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { capex: Math.max(0, +value) } })} />
        </div>
        <NumberInput id="cfg-autocapex" label={<span className="field-lab-row">Automation capex<HelpPopover text="Cost to automate this step — drives ROI payback." /></span>} min={0} value={s.automationCapex ?? 0} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { automationCapex: Math.max(0, +value) } })} />
      </div>
      <div className="row2" style={{ marginTop: 8 }}>
        <Select id="cfg-auto" labelText="Automation state" value={s.auto} onChange={(e) => up({ auto: e.target.value })}>
          {AUTO.map((t) => (
            <SelectItem key={t} value={t} text={t} />
          ))}
        </Select>
        <Select id="cfg-autooverride" labelText="Automate? (override)" value={s.autoOverride ?? "auto"} onChange={(e) => up({ autoOverride: e.target.value === "auto" ? null : e.target.value })}>
          <SelectItem value="auto" text="heuristic" />
          <SelectItem value="yes" text="force yes" />
          <SelectItem value="no" text="force no" />
        </Select>
      </div>
      <div className="row2" style={{ marginTop: 8 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <div style={{ position: "absolute", right: 0, top: 0, zIndex: 1 }}>{qAside("capacityPerShift")}</div>
          <NumberInput id="cfg-capacity" className={estClass("capacityPerShift")} label="Capacity/shift" value={s.capacityPerShift} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { capacityPerShift: +value } })} />
        </div>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <div style={{ position: "absolute", right: 0, top: 0, zIndex: 1 }}>{qAside("changeoverMin")}</div>
          <NumberInput id="cfg-changeover" className={estClass("changeoverMin")} label="Changeover (min)" value={s.changeoverMin} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { changeoverMin: +value } })} />
        </div>
      </div>
      <CycleBreakdownEditor api={api} s={s} />
      <div className="row2" style={{ marginTop: 8 }}>
        <Select id="cfg-ergo" labelText="Ergonomic risk" value={s.ergoRisk} onChange={(e) => up({ ergoRisk: e.target.value })}>
          {ERGO.map((t) => (
            <SelectItem key={t} value={t} text={t} />
          ))}
        </Select>
        <NumberInput id="cfg-shifthours" label={<span className="field-lab-row">Shift hours (override)<HelpPopover text="Leave blank to use the cell default." /></span>} allowEmpty value={s.shiftHours ?? ""} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { shiftHours: value === "" ? undefined : +value } })} />
      </div>
      <div style={{ marginTop: 8 }}>
        <TextInput id="cfg-utilities" labelText="Utilities (comma-sep)" value={(s.utilities ?? []).join(", ")} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { utilities: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} />
      </div>
      <div style={{ marginTop: 8 }}>
        <TextArea id="cfg-notes" labelText="Notes" rows={2} value={s.notes ?? ""} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { notes: e.target.value } })} />
      </div>
      </>
      ) : null}

      <div className="lab" style={{ margin: "12px 0 6px" }}>
        Connections
      </div>
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginBottom: 6 }}>Outgoing flows from this step:</div>
      {outFlows.map((f, i) => (
        <Tile key={i} style={{ padding: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", marginBottom: 6 }}>
            <span>→ {f.to}</span>
            <Button kind="danger--tertiary" size="sm" aria-label={`Remove flow to ${f.to}`} onClick={() => api.commit({ type: "REMOVE_FLOW", from: f.from, to: f.to })}>
              <TrashCan />
            </Button>
          </div>
          <div className="row2">
            <NumberInput id={`flow-vol-${i}`} label="Volume" value={f.volume} onFocus={api.checkpoint} onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { volume: +value } })} />
            <Select id={`flow-transport-${i}`} labelText="Transport" value={f.transport} onChange={(e) => api.commit({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { transport: e.target.value as Flow["transport"] } })}>
              {TRANSPORT.map((t) => (
                <SelectItem key={t} value={t} text={t} />
              ))}
            </Select>
          </div>
        </Tile>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Select id="cfg-addflow" labelText="Add flow to" hideLabel value={addTo} onChange={(e) => setAddTo(e.target.value)}>
            <SelectItem value="" text="add flow to…" disabled />
            {m.stations.filter((x) => x.id !== s.id).map((x) => (
              <SelectItem key={x.id} value={x.id} text={x.name} />
            ))}
          </Select>
        </div>
        <Button kind="tertiary" size="sm" onClick={() => { if (addTo) { api.commit({ type: "ADD_FLOW", from: s.id, to: addTo }); setAddTo(""); } }}>
          Add
        </Button>
      </div>
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
      <div style={{ margin: "2px 0 10px", display: "flex", alignItems: "center" }}>
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
        <span style={{ fontSize: "0.75rem", color: TEXTD, marginLeft: 8 }}>
          split {s.cycleTimeSec}s into value-add & waste
        </span>
      </div>
    );
  }

  const total = s.cycleTimeSec;
  const va = s.cycle.valueAddSec;
  const vaPct = total > 0 ? Math.round((va / total) * 100) : 0;

  return (
    <Tile style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="lab" style={{ margin: 0 }}>
          Cycle breakdown
          <HelpPopover text="Only value-add transforms the part. The other four classes are waste — the cycle time is their sum." />
        </span>
        <Button
          kind="tertiary"
          size="sm"
          title="Discard the split and go back to a single cycle time"
          onClick={() => {
            api.checkpoint();
            api.live({ type: "SET_CYCLE_BREAKDOWN", id: s.id, cycle: undefined });
          }}
        >
          Reset
        </Button>
      </div>

      {CYCLE_KEYS.map((k) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ width: 9, height: 9, background: CYCLE_COL[k], borderRadius: 0, flex: "0 0 auto" }} />
          <span style={{ fontSize: "0.75rem", flex: 1, color: k === "valueAddSec" ? "var(--text)" : TEXTD }}>{CYCLE_LABELS[k]}</span>
          <div style={{ width: 96, flex: "0 0 auto" }}>
            <NumberInput
              id={`cycle-${k}`}
              label={CYCLE_LABELS[k]}
              hideLabel
              size="sm"
              min={0}
              value={(s.cycle as CycleBreakdown)[k]}
              onFocus={api.checkpoint}
              onChange={(_: unknown, { value }: { value: number | string }) => api.live({ type: "PATCH_CYCLE_BREAKDOWN", id: s.id, patch: { [k]: Math.max(0, +value) } })}
            />
          </div>
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid " + LINE, marginTop: 8, paddingTop: 7, fontSize: "0.75rem" }}>
        <span>Total cycle</span>
        <span>
          <b>{total}s</b> <span style={{ color: vaPct >= 60 ? TEAL : vaPct >= 30 ? AMBER : RED }}>· {vaPct}% value-add</span>
        </span>
      </div>
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
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginBottom: 12, lineHeight: 1.5 }}>
        The whole layout is one JSON object. Export gives exactly this; Load expects it. Missing fields
        fill with defaults on import, and older files are migrated forward automatically.
      </div>
      <div style={{ fontSize: "0.75rem", marginBottom: 6 }}>
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
      <div style={{ fontSize: "0.75rem", marginBottom: 6 }}>
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
      <div style={{ fontSize: "0.75rem", marginBottom: 6 }}>
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
      <div style={{ fontSize: "0.75rem", color: TEXTD, lineHeight: 1.5 }}>
        Flow cost = Σ(volume × rectilinear-distance × unitCost). Chaining reads auto on both ends +
        transport: two auto steps with conveyor/agv = chained; with a manual handoff = auto-island.
      </div>
    </div>
  );
}
