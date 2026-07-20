import { useMemo, useState } from "react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { makeStation } from "@flowplan/core/store/reducer";
import { AUTO, CYCLE_KEYS, ERGO, MERGE_MODES, ROLES, SIDES, SPLIT_MODES, STATION_TYPES, TRANSPORT, fieldQuality, type CycleBreakdown, type DataQuality, type Flow, type RatingWeights, type Side, type Station, type StationDataField } from "@flowplan/core/model/types";
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
import { AMBER, CYCLE_COL, LINE, RED, TEAL, TEALD, TEXTD, PANEL2, scoreColor } from "./colors";
import { Field, HelpPopover, useToast } from "./ui";
import { QualitySelect } from "./confidence";
import type { CanvasMode } from "./LayoutCanvas";
import {
  deleteScenario,
  listScenarios,
  loadScenario,
  saveScenario,
} from "../store/scenarios";

export type Tab = "rating" | "balance" | "flow" | "auto" | "inspect" | "cost" | "chat" | "schema" | "workload" | "datasheet" | "capacity" | "doc";

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
      <div className="grade">
        <div className="gradeBox" style={{ border: "2px solid " + letterCol, color: letterCol }}>
          {r.letter}
        </div>
        <div>
          <div className="lab">Actual-state rating</div>
          <div style={{ fontSize: 26, fontWeight: 600 }}>
            {r.composite.toFixed(0)}
            <span style={{ fontSize: 13, color: TEXTD }}>/100</span>
          </div>
        </div>
      </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
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
        <div
          key={p.id}
          className="issue"
          style={{ borderLeftColor: p.severity === "block" ? RED : AMBER, marginBottom: 6, cursor: p.ref ? "pointer" : "default", fontSize: 11 }}
          onClick={() => {
            if (p.ref && api.model.stations.some((s) => s.id === p.ref)) {
              setSel(p.ref);
              setTab("inspect");
            }
          }}
        >
          {p.text}
        </div>
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
  setView: (v: "actual" | "improved" | "split") => void;
}) {
  const report = useMemo(() => findImprovements(api.model), [api.model]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="lab" style={{ marginBottom: 8 }}>
        What could be better
        <HelpPopover text="Ranked across every axis the engine can see: line balance, the constraint, waste content, station positions and cell form. Throughput gains outrank labour gains, which outrank shorter travel." />
      </div>

      {report.exhausted ? (
        <div className="ok" style={{ lineHeight: 1.5 }}>
          <b>No headroom found.</b>
          <div style={{ marginTop: 4, color: TEXTD }}>{report.why}</div>
        </div>
      ) : (
        report.improvements.slice(0, 6).map((imp: Improvement, i: number) => (
          <div
            key={imp.kind + i}
            className="card"
            style={{ borderLeft: "3px solid " + IMPROVEMENT_COLOR[imp.kind], cursor: imp.targetIds.length ? "pointer" : "default" }}
            onClick={() => {
              if (imp.kind === "relayout") setView("improved");
              else if (imp.targetIds[0]) {
                setSel(imp.targetIds[0]);
                setTab("inspect");
              }
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <b style={{ fontSize: 12 }}>{imp.title}</b>
              <span style={{ fontSize: 10.5, color: TEXTD, whiteSpace: "nowrap" }}>
                {imp.confidence} conf.
              </span>
            </div>
            <div style={{ fontSize: 11, color: TEXTD, lineHeight: 1.5 }}>{imp.detail}</div>
          </div>
        ))
      )}

      <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 6 }}>
        Balance loss {report.balanceLossPct}% · takt {report.taktSec}s · {report.lineOut.toLocaleString("en-US")}/shift
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
      <button className="btn sm" style={{ width: "100%" }} onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Adjust KPI weights{custom ? " (custom)" : ""}
      </button>
      {open ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10.5, color: TEXTD, marginBottom: 8 }}>
            Re-weight the composite to match your priorities. Values are normalized to 100%; the grade updates live.
          </div>
          {WEIGHT_LABELS.map(([key, label]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                <span>{label}</span>
                <span style={{ color: TEAL }}>{(w[key] * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={w[key]}
                onPointerDown={api.checkpoint}
                onChange={(e) => api.live({ type: "SET_WEIGHTS", weights: { ...w, [key]: +e.target.value } })}
              />
            </div>
          ))}
          {custom ? (
            <button className="btn sm" style={{ width: "100%" }} onClick={() => api.commit({ type: "SET_WEIGHTS", weights: undefined })}>
              Reset to defaults
            </button>
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
          {bal.lineOut.toLocaleString()} <span style={{ fontSize: 12, color: TEXTD, fontWeight: 400 }}>parts/shift</span>
        </div>
        <div style={{ fontSize: 11, color: TEXTD, marginTop: 4 }}>
          Takt ≈ {bal.takt} s/part · balance score {bal.score}/100
        </div>
      </div>
      {advice.length > 0 ? (
        <div className="issue" style={{ borderLeftColor: RED, cursor: bal.bottleneck ? "pointer" : "default" }} onClick={() => bal.bottleneck && (setSel(bal.bottleneck.id), setTab("inspect"))}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>How to lift the constraint</div>
          {advice.map((t, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              · {t}
            </div>
          ))}
        </div>
      ) : null}
      <div className="lab" style={{ margin: "14px 0 8px" }}>
        Throughput per step (util % vs line)
      </div>
      {bal.steps.map((x) => {
        const isBn = bal.bottleneck && x.id === bal.bottleneck.id;
        const col = isBn ? RED : x.util >= 85 ? AMBER : TEAL;
        return (
          <div key={x.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
              <span>{x.name + (isBn ? " ◀ bottleneck" : "")}</span>
              <span style={{ color: col }}>{x.rate.toLocaleString() + "/sh · " + x.util + "%"}</span>
            </div>
            <div className="bar">
              <div style={{ width: Math.round((x.rate / maxRate) * 100) + "%", background: col }} />
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 8, lineHeight: 1.5 }}>
        Rate = min(3600/cycle × shift-hours × operators, capacity/shift) × parallel units. Low-util
        steps are starved by the bottleneck — that's spare capacity, not a problem to fix.
      </div>
      <CycleSection api={api} setSel={setSel} setTab={setTab} />
      <ParallelSection api={api} setSel={setSel} setTab={setTab} />
      <YieldSection api={api} />
      <FreedomSection api={api} setTab={setTab} />
      <GuardrailSection api={api} setSel={setSel} setTab={setTab} />
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
        <div className="ok">Good and reject paths are spatially separated — a mix-up is impossible by design.</div>
      ) : (
        findings.map((f) => (
          <div
            key={f.id}
            className="issue"
            style={{ borderLeftColor: f.severity === "error" ? RED : AMBER, marginBottom: 6, cursor: f.stationId ? "pointer" : "default", fontSize: 11 }}
            onClick={() => { if (f.stationId) { setSel(f.stationId); setTab("inspect"); } }}
          >
            {f.message}
          </div>
        ))
      )}
    </div>
  );
}

// Freedom-finding (blueprint §4.8). A linear routing implies an order that
// mostly does not exist; this surfaces which operations the balancer may move to
// fill an under-loaded station. Only meaningful once a workload is present.
const FREEDOM_COL: Record<FreedomFinding, string> = { free: TEAL, swappable: AMBER, exclusive: "#a582c9", compulsory: TEXTD };
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
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, marginBottom: 8 }}>
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
                <div style={{ fontSize: 10, color: TEXTD }}>{e.reason}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {fr.counts.free > 0 ? (
        <div style={{ fontSize: 10.5, color: TEAL, marginTop: 4, cursor: "pointer" }} onClick={() => setTab("workload")}>
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
        <div style={{ fontSize: 11, color: TEXTD, lineHeight: 1.6 }}>
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
              <span style={{ fontSize: 12, color: TEXTD, fontWeight: 400 }}>%</span>
            </div>
            <div style={{ fontSize: 11, color: TEXTD, marginTop: 4 }}>
              {analysis.lineValueAddSec}s value-add · {analysis.lineNonValueAddSec}s waste ·{" "}
              {analysis.decomposedCount}/{analysis.totalCount} steps split
            </div>
          </div>

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
            <div className="issue" style={{ borderLeftColor: AMBER, marginTop: 12, cursor: "default" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Where the waste is</div>
              {tips.map((t, i) => (
                <div key={i} style={{ marginBottom: 3 }}>
                  · {t}
                </div>
              ))}
            </div>
          ) : null}

          {analysis.waste.length > 0 ? (
            <>
              <div className="lab" style={{ margin: "14px 0 8px" }}>
                Waste backlog (largest first)
              </div>
              {analysis.waste.slice(0, 6).map((wst, i) => (
                <div key={wst.stationId + wst.key + i} style={{ marginBottom: 8, cursor: "pointer" }} onClick={() => open(wst.stationId)}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
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
          <span style={{ fontSize: 11, color: TEXTD }}>—</span>
        ) : (
          path.map((id, i) => (
            <span key={id} style={{ display: "inline-flex", alignItems: "center" }}>
              <span className="pill" style={{ background: "rgba(43,182,168,.12)", color: TEAL, cursor: "pointer" }} onClick={() => { setSel(id); setTab("inspect"); }}>
                {byId[id]}
              </span>
              {i < path.length - 1 ? <span style={{ color: TEXTD, margin: "0 2px" }}>→</span> : null}
            </span>
          ))
        )}
      </div>
      <div style={{ fontSize: 10.5, color: TEXTD, marginBottom: 4 }}>The longest cumulative-cycle route — the sequence that sets the line's pace.</div>

      {bal.syncWaits.length > 0 ? (
        <>
          <div className="lab" style={{ margin: "14px 0 8px" }}>
            Merge synchronization
          </div>
          {bal.syncWaits.map((sw) => (
            <div key={sw.mergeId} className="issue" style={{ borderLeftColor: AMBER, background: "rgba(224,164,88,.08)", cursor: "pointer" }} onClick={() => { setSel(sw.mergeId); setTab("inspect"); }}>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>
                {sw.mergeName}: paced by {sw.bindingName} at {sw.bindingRate.toLocaleString()}/sh
              </div>
              {sw.waiters.map((w) => (
                <div key={w.id} style={{ fontSize: 11 }}>
                  · {w.name} idles ~{w.idle.toLocaleString()}/sh — add a ≈{w.buffer.toLocaleString()}-part buffer to decouple.
                </div>
              ))}
            </div>
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
          {y.rolledYield}% <span style={{ fontSize: 12, color: TEXTD, fontWeight: 400 }}>good parts</span>
        </div>
        <div style={{ fontSize: 11, color: TEXTD, marginTop: 4 }}>≈ {y.totalScrap.toLocaleString()} scrap parts/shift across the line</div>
      </div>
      {withScrap.length === 0 ? (
        <div style={{ fontSize: 10.5, color: TEXTD }}>Set a scrap rate per step in Configure to see where yield is lost.</div>
      ) : (
        withScrap.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
            <span>{s.name}</span>
            <span style={{ color: RED }}>
              {Math.round(s.scrapRate * 100)}% · {Math.round(s.scrapUnits).toLocaleString()}/sh
            </span>
          </div>
        ))
      )}
      <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 6, lineHeight: 1.5 }}>
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
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input placeholder="name this variant…" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn sm"
          onClick={() => {
            const n = name.trim() || api.model.name || "Variant";
            saveScenario(n, api.model);
            setName("");
            setTick((t) => t + 1);
            toast("Saved scenario “" + n + "”");
          }}
        >
          Save
        </button>
      </div>
      {scenarios.length === 0 ? (
        <div style={{ fontSize: 10.5, color: TEXTD }}>Save the current layout as a named variant to compare alternatives.</div>
      ) : (
        scenarios.map((s) => (
          <div key={s.name + tick} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, fontSize: 11.5 }}>
            <button className="btn sm" style={{ flex: 1, textAlign: "left" }} onClick={() => { const m = loadScenario(s.name); if (m) { api.reset(m); toast("Loaded “" + s.name + "”"); } }}>
              {s.name}
            </button>
            <button className="btn sm" style={{ borderColor: RED, color: RED, marginLeft: 6 }} onClick={() => { deleteScenario(s.name); setTick((t) => t + 1); }}>
              ×
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function LayoutSettings({ api }: { api: FlowPlanApi }) {
  const m = api.model;
  return (
    <div>
      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Layout settings
      </div>
      <Field label="Cell name">
        <input value={m.name} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "SET_NAME", name: e.target.value })} />
      </Field>
      <div className="row2">
        <Field label="Grid width" help="Stations are re-clamped inside the grid when you shrink it.">
          <input type="number" value={m.gridW} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "SET_GRID", gridW: +e.target.value, gridH: m.gridH })} />
        </Field>
        <Field label="Grid height">
          <input type="number" value={m.gridH} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "SET_GRID", gridW: m.gridW, gridH: +e.target.value })} />
        </Field>
      </div>
      <Field label="Shift length (hours)" help="Used by the balance model for throughput. Stations can override this individually in Configure.">
        <input type="number" value={m.shiftHours ?? 8} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "SET_SHIFT_HOURS", shiftHours: +e.target.value })} />
      </Field>
    </div>
  );
}

function NoGoSection({ api, mode, setMode }: { api: FlowPlanApi; mode: CanvasMode; setMode: (m: CanvasMode) => void }) {
  return (
    <div>
      <div className="lab" style={{ margin: "16px 0 8px" }}>
        No-go zones
      </div>
      <button className={"btn sm" + (mode === "nogo" ? " on" : "")} onClick={() => setMode(mode === "nogo" ? "select" : "nogo")}>
        {mode === "nogo" ? "Drawing… (click to stop)" : "Draw a no-go zone"}
      </button>
      <div style={{ fontSize: 10.5, color: TEXTD, margin: "6px 0" }}>Drag a rectangle on the canvas. The optimizer and templates avoid these.</div>
      {(api.model.noGoZones ?? []).map((z, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, fontSize: 11.5 }}>
          <span>
            zone {i + 1} · {z.w}×{z.h} @ ({z.x},{z.y})
          </span>
          <button className="btn sm" style={{ borderColor: RED, color: RED }} onClick={() => api.commit({ type: "REMOVE_NOGO", index: i })}>
            ×
          </button>
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
      <div className={v.valid ? "ok" : "issue"} style={{ marginBottom: 12, cursor: "default" }}>
        {v.valid ? "Process flow is valid — every step connects input→output." : errCount + " blocking issue(s) found."}
      </div>
      <div className="lab" style={{ marginBottom: 8 }}>
        Validation
      </div>
      {v.issues.length === 0 ? <div style={{ fontSize: 11.5, color: TEXTD }}>No dead ends, orphans, or unreachable steps.</div> : null}
      {v.issues.map((it, i) => (
        <div
          key={i}
          className="issue"
          style={{ borderLeftColor: it.sev === "err" ? RED : AMBER, background: it.sev === "err" ? "rgba(217,107,91,.08)" : "rgba(224,164,88,.08)" }}
          onClick={() => { if (it.id) { setSel(it.id); setTab("inspect"); } }}
        >
          <span style={{ color: it.sev === "err" ? RED : AMBER }}>{it.sev === "err" ? "● " : "▲ "}</span>
          {it.msg}
        </div>
      ))}

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Draw connections
      </div>
      <button className={"btn sm" + (mode === "flow" ? " on" : "")} onClick={() => setMode(mode === "flow" ? "select" : "flow")}>
        {mode === "flow" ? "Picking… tap source then target" : "Draw a flow on the canvas"}
      </button>

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Cell form templates
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {(["I", "U", "L", "S"] as CellForm[]).map((fm) => (
          <button key={fm} className="btn sm" onClick={() => { api.commit({ type: "APPLY_TEMPLATE", form: fm }); toast(fm + "-shape applied"); }}>
            {fm}-shape
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: TEXTD }}>Arranges movable process steps along the chosen form. Fixed and I/O stations stay put.</div>

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Add a step
      </div>
      <button
        className="btn"
        style={{ width: "100%" }}
        onClick={() => {
          const ns = makeStation(api.model);
          api.commit({ type: "ADD_STATION", station: ns });
          setSel(ns.id);
          setTab("inspect");
        }}
      >
        + Add process step
      </button>

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
      <div className={chain.islands > 0 ? "issue" : "ok"} style={{ marginBottom: 12, cursor: "default", borderLeftColor: chain.islands > 0 ? AMBER : TEAL, background: chain.islands > 0 ? "rgba(224,164,88,.08)" : "rgba(43,182,168,.08)" }}>
        {chain.islands > 0 ? chain.islands + " auto-island(s): two automated steps joined by a manual handoff — prime to chain." : "No broken automation chains detected."}
      </div>
      {chain.links.map((l, i) => {
        const col = l.kind === "auto-island" ? RED : l.kind === "chained-auto" ? TEAL : l.kind === "mixed" ? AMBER : TEXTD;
        return (
          <div key={i} className="card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11.5 }}>{l.from + " → " + l.to}</span>
              <span className="pill" style={{ background: "rgba(255,255,255,.05)", color: col }}>
                {l.kind}
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 3 }}>via {l.transport}</div>
          </div>
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
            <div key={s.id} className="card" style={{ cursor: "pointer" }} onClick={() => { setSel(s.id); setTab("inspect"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{s.name}</span>
                <span style={{ color: col, fontSize: 12 }}>{ap.verdict + " · " + ap.pct.toFixed(0)}</span>
              </div>
              <div className="bar">
                <div style={{ width: ap.pct + "%", background: col }} />
              </div>
              <div style={{ fontSize: 10, color: TEXTD, marginTop: 4 }}>
                currently {s.auto} · {ap.src === "override" ? "manual override" : "heuristic"}
              </div>
            </div>
          );
        })}
      <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 6 }}>
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
                  style={{ width: 16, height: 16, padding: 0, borderRadius: 3, border: "1px solid " + LINE, background: on ? TEAL : "transparent", cursor: "pointer" }}
                />
              );
            }),
          )}
        </div>
        <button className="btn sm" type="button" onClick={() => api.commit({ type: "UPDATE_STATION", id: station.id, patch: { cells: undefined } })}>
          Fill (rect)
        </button>
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
        <div style={{ color: TEXTD, fontSize: 12 }}>
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
        <button className="btn sm" style={{ borderColor: RED, color: RED }} onClick={() => { api.commit({ type: "DELETE_STATION", id: s.id }); setSel(null); }}>
          Delete
        </button>
      </div>
      {/* Essentials — the handful of fields a first pass needs. Everything else
          is one click away under Advanced, so this is no longer the app's
          densest screen. */}
      <Field label="Name">
        <input value={s.name} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { name: e.target.value } })} />
      </Field>
      <div className="row2">
        <Field label="Role (I/O flexible)">
          <select value={s.role} onChange={(e) => up({ role: e.target.value })}>
            {ROLES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select value={s.type} onChange={(e) => up({ type: e.target.value })}>
            {STATION_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row2">
        <Field label="Cycle time (s)" aside={qAside("cycleTimeSec")} help={s.cycle ? "Derived from the breakdown below — edit the components to change it." : undefined}>
          <input className={estClass("cycleTimeSec")} type="number" value={s.cycleTimeSec} disabled={!!s.cycle} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { cycleTimeSec: +e.target.value } })} />
        </Field>
        <Field label="Operators">
          <input type="number" value={s.operators} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { operators: +e.target.value } })} />
        </Field>
      </div>
      <Field label="Fixed / anchored">
        <button className="btn" style={{ width: "100%", background: s.fixed ? AMBER : PANEL2, color: s.fixed ? "#0e1416" : undefined }} onClick={() => up({ fixed: !s.fixed })}>
          {s.fixed ? "FIXED — won't be moved" : "Movable"}
        </button>
      </Field>

      <button
        className="btn sm"
        style={{ width: "100%", justifyContent: "center", margin: "6px 0 4px" }}
        aria-expanded={showAdv}
        onClick={() => setShowAdv((v) => !v)}
      >
        {showAdv ? "▾ Hide advanced" : "▸ Advanced settings"}
      </button>

      {showAdv ? (
      <>
      <Field label="Station id (rename)" help="Renaming rewrites every flow that references this station.">
        <div style={{ display: "flex", gap: 6 }}>
          <input placeholder={s.id} value={renameVal} onChange={(e) => setRenameVal(e.target.value)} />
          <button
            className="btn sm"
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
          </button>
        </div>
      </Field>
      <div className="row2">
        <Field label="Width">
          <input type="number" value={s.w} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { w: Math.max(1, +e.target.value) } })} />
        </Field>
        <Field label="Height">
          <input type="number" value={s.h} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { h: Math.max(1, +e.target.value) } })} />
        </Field>
      </div>
      <CellShapeEditor api={api} station={s} />
      <div className="row2">
        <Field label="IN port" help="Edge where material enters; flows route to this port.">
          <select value={s.inSide ?? "left"} onChange={(e) => up({ inSide: e.target.value as Side })}>
            {SIDES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="OUT port" help="Edge where material exits.">
          <select value={s.outSide ?? "right"} onChange={(e) => up({ outSide: e.target.value as Side })}>
            {SIDES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row2">
        <Field label="Scrap port">
          <select value={s.scrapSide ?? "bottom"} onChange={(e) => up({ scrapSide: e.target.value as Side })}>
            {SIDES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Scrap rate (%)" help="Share of incoming parts scrapped here. Shown in Balance ▸ Yield; not part of the grade.">
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round((s.scrapRate ?? 0) * 100)}
            onFocus={api.checkpoint}
            onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { scrapRate: Math.max(0, Math.min(100, +e.target.value)) / 100 } })}
          />
        </Field>
      </div>
      <div className="row2">
        <Field label="Parallel units (×N)" help="Identical resources running in parallel at this step. Capacity scales ×N.">
          <input
            type="number"
            min={1}
            value={s.parallelUnits ?? 1}
            onFocus={api.checkpoint}
            onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { parallelUnits: Math.max(1, Math.round(+e.target.value)) } })}
          />
        </Field>
        {outFlows.length > 1 ? (
          <Field label="Split mode" help="distribute = volume splits by share across lanes; fork = each branch gets full part count (distinct components).">
            <select value={s.splitMode ?? "distribute"} onChange={(e) => up({ splitMode: e.target.value })}>
              {SPLIT_MODES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        ) : (
          <div style={{ flex: 1 }} />
        )}
      </div>
      {inCount > 1 ? (
        <Field label="Merge mode" help="sum = inbound rates add; assemble = synchronized, needs one of each input (rate = slowest feeder).">
          <select value={s.mergeMode ?? "sum"} onChange={(e) => up({ mergeMode: e.target.value })}>
            {MERGE_MODES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      ) : null}
      <div className="row2">
        <Field label="Equipment capex" aside={qAside("capex")} help="One-time cost of this step's equipment (Cost tab).">
          <input className={estClass("capex")} type="number" min={0} value={s.capex ?? 0} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { capex: Math.max(0, +e.target.value) } })} />
        </Field>
        <Field label="Automation capex" help="Cost to automate this step — drives ROI payback.">
          <input type="number" min={0} value={s.automationCapex ?? 0} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { automationCapex: Math.max(0, +e.target.value) } })} />
        </Field>
      </div>
      <div className="row2">
        <Field label="Automation state">
          <select value={s.auto} onChange={(e) => up({ auto: e.target.value })}>
            {AUTO.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Automate? (override)">
          <select value={s.autoOverride ?? "auto"} onChange={(e) => up({ autoOverride: e.target.value === "auto" ? null : e.target.value })}>
            <option value="auto">heuristic</option>
            <option value="yes">force yes</option>
            <option value="no">force no</option>
          </select>
        </Field>
      </div>
      <div className="row2">
        <Field label="Capacity/shift" aside={qAside("capacityPerShift")}>
          <input className={estClass("capacityPerShift")} type="number" value={s.capacityPerShift} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { capacityPerShift: +e.target.value } })} />
        </Field>
        <Field label="Changeover (min)" aside={qAside("changeoverMin")}>
          <input className={estClass("changeoverMin")} type="number" value={s.changeoverMin} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { changeoverMin: +e.target.value } })} />
        </Field>
      </div>
      <CycleBreakdownEditor api={api} s={s} />
      <div className="row2">
        <Field label="Ergonomic risk">
          <select value={s.ergoRisk} onChange={(e) => up({ ergoRisk: e.target.value })}>
            {ERGO.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Shift hours (override)" help="Leave blank to use the cell default.">
          <input type="number" value={s.shiftHours ?? ""} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { shiftHours: e.target.value === "" ? undefined : +e.target.value } })} />
        </Field>
      </div>
      <Field label="Utilities (comma-sep)">
        <input value={(s.utilities ?? []).join(", ")} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { utilities: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} />
      </Field>
      <Field label="Notes">
        <textarea style={{ minHeight: 42, resize: "vertical" }} value={s.notes ?? ""} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { notes: e.target.value } })} />
      </Field>
      </>
      ) : null}

      <div className="lab" style={{ margin: "12px 0 6px" }}>
        Connections
      </div>
      <div style={{ fontSize: 10.5, color: TEXTD, marginBottom: 6 }}>Outgoing flows from this step:</div>
      {outFlows.map((f, i) => (
        <div key={i} className="card" style={{ padding: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, marginBottom: 6 }}>
            <span>→ {f.to}</span>
            <button className="btn sm" style={{ borderColor: RED, color: RED }} onClick={() => api.commit({ type: "REMOVE_FLOW", from: f.from, to: f.to })}>
              ×
            </button>
          </div>
          <div className="row2">
            <Field label="Volume">
              <input type="number" value={f.volume} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { volume: +e.target.value } })} />
            </Field>
            <Field label="Transport">
              <select value={f.transport} onChange={(e) => api.commit({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { transport: e.target.value as Flow["transport"] } })}>
                {TRANSPORT.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <select value={addTo} style={{ flex: 1 }} onChange={(e) => setAddTo(e.target.value)}>
          <option value="" disabled>
            add flow to…
          </option>
          {m.stations.filter((x) => x.id !== s.id).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button className="btn sm" onClick={() => { if (addTo) { api.commit({ type: "ADD_FLOW", from: s.id, to: addTo }); setAddTo(""); } }}>
          Add
        </button>
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
      <div style={{ margin: "2px 0 10px" }}>
        <button
          className="btn sm"
          onClick={() => {
            api.checkpoint();
            api.live({ type: "SET_CYCLE_BREAKDOWN", id: s.id, cycle: seedBreakdown(s) });
          }}
        >
          Decompose cycle
        </button>
        <span style={{ fontSize: 10.5, color: TEXTD, marginLeft: 8 }}>
          split {s.cycleTimeSec}s into value-add & waste
        </span>
      </div>
    );
  }

  const total = s.cycleTimeSec;
  const va = s.cycle.valueAddSec;
  const vaPct = total > 0 ? Math.round((va / total) * 100) : 0;

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="lab" style={{ margin: 0 }}>
          Cycle breakdown
          <HelpPopover text="Only value-add transforms the part. The other four classes are waste — the cycle time is their sum." />
        </span>
        <button
          className="btn sm"
          title="Discard the split and go back to a single cycle time"
          onClick={() => {
            api.checkpoint();
            api.live({ type: "SET_CYCLE_BREAKDOWN", id: s.id, cycle: undefined });
          }}
        >
          Reset
        </button>
      </div>

      {CYCLE_KEYS.map((k) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ width: 9, height: 9, background: CYCLE_COL[k], borderRadius: 2, flex: "0 0 auto" }} />
          <span style={{ fontSize: 11, flex: 1, color: k === "valueAddSec" ? "var(--text)" : TEXTD }}>{CYCLE_LABELS[k]}</span>
          <input
            type="number"
            min={0}
            style={{ width: 74, flex: "0 0 auto" }}
            value={(s.cycle as CycleBreakdown)[k]}
            onFocus={api.checkpoint}
            onChange={(e) => api.live({ type: "PATCH_CYCLE_BREAKDOWN", id: s.id, patch: { [k]: Math.max(0, +e.target.value) } })}
          />
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid " + LINE, marginTop: 8, paddingTop: 7, fontSize: 11 }}>
        <span>Total cycle</span>
        <span>
          <b>{total}s</b> <span style={{ color: vaPct >= 60 ? TEAL : vaPct >= 30 ? AMBER : RED }}>· {vaPct}% value-add</span>
        </span>
      </div>
    </div>
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
