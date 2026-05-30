import { useState } from "react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { makeStation } from "../store/reducer";
import { AUTO, ERGO, MERGE_MODES, ROLES, SIDES, SPLIT_MODES, STATION_TYPES, TRANSPORT, type Flow, type RatingWeights, type Side, type Station } from "../model/types";
import type { CellForm } from "../engine/templates";
import { WEIGHTS, normalizeWeights } from "../engine/rating";
import { bottleneckAdvice } from "../engine/balance";
import { yieldAnalysis } from "../engine/yield";
import { stationCells } from "../engine/geometry";
import { autoPotential } from "../engine/automation";
import { AMBER, LINE, RED, TEAL, TEALD, TEXTD, PANEL2, scoreColor } from "./colors";
import { Field, HelpPopover, useToast } from "./ui";
import type { CanvasMode } from "./LayoutCanvas";
import {
  deleteScenario,
  listScenarios,
  loadScenario,
  saveScenario,
} from "../store/scenarios";

export type Tab = "rating" | "balance" | "flow" | "auto" | "inspect" | "copilot" | "schema";

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

export function RatingPanel({ api, setView }: PanelProps) {
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
      <div className="imp">
        <div className="lab">
          Improvement potential
          <HelpPopover text="Greedy pairwise swaps — a local floor, not a global optimum. It repositions movable boxes; it won't resize or re-route, and it respects fixed stations and no-go zones." />
        </div>
        <div className="impVal">
          −{r.flowReductionPct.toFixed(0)}% <span style={{ fontSize: 12, color: TEXTD, fontWeight: 400 }}>flow cost</span>
        </div>
        {r.moves.length > 0 ? (
          <button className="btn" style={{ marginTop: 10, width: "100%", borderColor: TEALD, color: TEAL }} onClick={() => setView("improved")}>
            View improved layout →
          </button>
        ) : null}
      </div>
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
      <ParallelSection api={api} setSel={setSel} setTab={setTab} />
      <YieldSection api={api} />
    </div>
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
  return (
    <div className="pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="lab">Configure · {s.id}</div>
        <button className="btn sm" style={{ borderColor: RED, color: RED }} onClick={() => { api.commit({ type: "DELETE_STATION", id: s.id }); setSel(null); }}>
          Delete
        </button>
      </div>
      <Field label="Name">
        <input value={s.name} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { name: e.target.value } })} />
      </Field>
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
      <Field label="Fixed / anchored">
        <button className="btn" style={{ width: "100%", background: s.fixed ? AMBER : PANEL2, color: s.fixed ? "#0e1416" : undefined }} onClick={() => up({ fixed: !s.fixed })}>
          {s.fixed ? "FIXED — won't be moved" : "Movable"}
        </button>
      </Field>
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
        <Field label="Capacity/shift">
          <input type="number" value={s.capacityPerShift} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { capacityPerShift: +e.target.value } })} />
        </Field>
        <Field label="Operators">
          <input type="number" value={s.operators} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { operators: +e.target.value } })} />
        </Field>
      </div>
      <div className="row2">
        <Field label="Cycle time (s)">
          <input type="number" value={s.cycleTimeSec} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { cycleTimeSec: +e.target.value } })} />
        </Field>
        <Field label="Changeover (min)">
          <input type="number" value={s.changeoverMin} onFocus={api.checkpoint} onChange={(e) => api.live({ type: "UPDATE_STATION", id: s.id, patch: { changeoverMin: +e.target.value } })} />
        </Field>
      </div>
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
        ["cycleTimeSec", "int", "per-part cycle"],
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
