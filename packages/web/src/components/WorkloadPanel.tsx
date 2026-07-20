import { useMemo, useState } from "react";
import type { PanelProps } from "./panels";
import type { Confidence, TimeMethod, WorkClass, WorkElement } from "@flowplan/core/model/types";
import { CONFIDENCES, LOSS_FACTOR_BAND, TIME_METHODS, WORK_CLASSES, lossFactorOf } from "@flowplan/core/model/types";
import { analyseWorkload, makeWorkElement, precedenceOrder } from "@flowplan/core/engine/workload";
import { inferWorkload, type InferenceResult } from "@flowplan/core/engine/infer";
import { AMBER, LINE, RED, TEAL, TEXT, TEXTD } from "./colors";
import { HelpPopover } from "./ui";

// Spec §11 — the product-free workload editor.
//
// `analyseWorkload` has existed and been tested since schema v8 and nothing
// could reach it: `Model.workElements` was on the type, but no reducer action
// and no screen ever wrote it. This panel is that missing half.
//
// It is deliberately NOT another station inspector. The spec's flow is
//   workload → balancer → stations
// and this is the first step of it. Elements carry seconds, a VA/NNVA/NVA
// classification, an attended fraction and a confidence — the four things §8
// and §11 say a time must carry for optimization to be possible at all.

const CLASS_COL: Record<WorkClass, string> = { VA: TEAL, NNVA: AMBER, NVA: RED };

function num(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ConfidenceDot({ c }: { c: Confidence }) {
  const col = c === "high" ? TEAL : c === "med" ? AMBER : RED;
  return <span title={`${c} confidence`} style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: col, marginRight: 5 }} />;
}

export function WorkloadPanel({ api }: PanelProps) {
  const model = api.model;
  const elements = useMemo(() => model.workElements ?? [], [model.workElements]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [derived, setDerived] = useState<InferenceResult | null>(null);

  // Takt drives the station counts. Absent a demand figure the analysis still
  // produces every time figure — §11 — so this panel is useful before takt is known.
  const taktSec = useMemo(() => {
    const stations = model.stations.filter((s) => s.role === "process");
    if (stations.length === 0) return undefined;
    const slowest = Math.max(...stations.map((s) => s.cycleTimeSec || 0));
    return slowest > 0 ? slowest : undefined;
  }, [model.stations]);

  const lossFactor = lossFactorOf(model);
  const a = useMemo(
    () => analyseWorkload(elements, model.variantModes, taktSec, lossFactor),
    [elements, model.variantModes, taktSec, lossFactor],
  );
  const order = useMemo(() => precedenceOrder(elements), [elements]);
  // "Chosen" is what the planner actually built — the process stations on the
  // layout — set against the work-content "calculated" figure (spec / IE
  // blueprint: STATIONS CALCULATED 4.9 · STATIONS CHOSEN 5).
  const chosenStations = model.stations.filter((s) => s.role === "process").length;

  function add() {
    const id = `we${elements.length + 1}_${Math.random().toString(36).slice(2, 6)}`;
    api.commit({ type: "ADD_WORK_ELEMENT", element: makeWorkElement(id, `Element ${elements.length + 1}`, 10) });
    setOpenId(id);
  }
  function patch(id: string, p: Partial<WorkElement>) {
    api.commit({ type: "UPDATE_WORK_ELEMENT", id, patch: p });
  }

  // Seed from the stations that already exist. Most cells reaching this panel
  // were authored station-first (the inversion in contradiction 2 is not done),
  // so an empty workload is the common case and "type it all again" is the
  // wrong answer. Everything inferred lands at low confidence and says why.
  const processStations = model.stations.filter((s) => s.role === "process");
  function derive() {
    const inf = inferWorkload(processStations.map((s) => ({ name: s.name, seconds: s.cycleTimeSec || undefined })));
    api.commit({ type: "SET_WORK_ELEMENTS", elements: inf.elements });
    setDerived(inf);
  }

  if (elements.length === 0) {
    return (
      <div className="pad">
        <div className="lab" style={{ marginBottom: 8 }}>Workload</div>
        <p style={{ fontSize: 11.5, color: TEXTD, lineHeight: 1.6 }}>
          The product-free input: what must be done, independent of what is made.
          Add elements with a time, a value classification and how much of that
          time binds an operator — the balancer turns them into stations.
        </p>
        {processStations.length > 0 ? (
          <>
            <button className="btn" style={{ marginTop: 10, color: TEAL, width: "100%" }} onClick={derive}>
              Derive from {processStations.length} process station{processStations.length === 1 ? "" : "s"}
            </button>
            <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 6, lineHeight: 1.5 }}>
              Names are matched against the capability keyword list. Everything
              inferred lands at <strong>low confidence</strong> — check it.
            </div>
          </>
        ) : null}
        <button className="btn" style={{ marginTop: 8, color: TEXTD }} onClick={add}>Add element manually</button>
      </div>
    );
  }

  return (
    <div className="pad">
      <div className="lab" style={{ marginBottom: 8 }}>Workload — {elements.length} element{elements.length === 1 ? "" : "s"}</div>

      {/* --- analysis readout: the engine's answer, always visible --- */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5 }}>
          <span><span style={{ color: TEXTD }}>weighted </span><strong style={{ color: TEXT }}>{a.weightedTotalSec.toFixed(1)}s</strong></span>
          <span><span style={{ color: TEXTD }}>worst mode </span><strong style={{ color: TEXT }}>{a.worstTotalSec.toFixed(1)}s</strong></span>
          {a.mixSpreadPct > 0 ? <span style={{ color: AMBER }}>+{a.mixSpreadPct.toFixed(0)}% spread</span> : null}
          <span><ConfidenceDot c={a.confidence} /><span style={{ color: TEXTD }}>{a.confidence}</span></span>
        </div>

        {/* VA/NNVA/NVA bar — §8: time is decomposed, never flat. */}
        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", margin: "10px 0 6px", background: LINE }}>
          {(["VA", "NNVA", "NVA"] as WorkClass[]).map((k) => {
            const sec = k === "VA" ? a.vaSec : k === "NNVA" ? a.nnvaSec : a.nvaSec;
            const pct = a.weightedTotalSec > 0 ? (sec / a.weightedTotalSec) * 100 : 0;
            return <div key={k} title={`${k} ${sec.toFixed(1)}s`} style={{ width: `${pct}%`, background: CLASS_COL[k] }} />;
          })}
        </div>
        <div style={{ fontSize: 10.5, color: TEXTD }}>
          VA {a.vaPct == null ? "—" : `${a.vaPct.toFixed(0)}%`} · operator-bound{" "}
          {a.attendedPct == null ? "—" : `${a.attendedPct.toFixed(0)}%`}
          {a.stationsCalculated == null ? " · no takt yet" : ""}
        </div>

        {/* Stations calculated (decimal, loss-factored) vs chosen (spec §4.3):
            the decimal says how much headroom is left. Never silently rounded. */}
        {a.stationsCalculated != null ? (
          <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11 }}>
            <span>
              <span style={{ color: TEXTD }}>calculated </span>
              <strong style={{ color: TEXT }}>{a.stationsCalculated.toFixed(1)}</strong>
              <span style={{ color: TEXTD }}> ({a.stationsCalculatedWorst?.toFixed(1)} worst)</span>
            </span>
            <span>
              <span style={{ color: TEXTD }}>chosen </span>
              <strong style={{ color: chosenStations >= Math.ceil(a.stationsCalculatedWorst ?? a.stationsCalculated) ? TEAL : AMBER }}>
                {chosenStations}
              </strong>
              <span style={{ color: TEXTD }}> placed</span>
            </span>
          </div>
        ) : null}

        {/* Loss factor — a chosen IE constant, shown with its band so it reads as
            provenance, not a free knob. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 10.5, color: TEXTD }}>
          <span>
            loss factor
            <HelpPopover text={`Carries walking, reaching, handling and balancing loss — none of which is in a standard time. Calculated stations = (work content ÷ takt) × loss factor. Band ${LOSS_FACTOR_BAND[0]}–${LOSS_FACTOR_BAND[1]}; default 1.2.`} />
          </span>
          <input
            type="range"
            min={LOSS_FACTOR_BAND[0]}
            max={LOSS_FACTOR_BAND[1]}
            step={0.01}
            value={lossFactor}
            style={{ flex: 1, maxWidth: 120 }}
            onChange={(e) => api.commit({ type: "SET_LOSS_FACTOR", lossFactor: +e.target.value })}
          />
          <strong style={{ color: TEXT }}>{lossFactor.toFixed(2)}</strong>
        </div>
      </div>

      {order === null ? (
        <div className="issue" style={{ marginBottom: 10, borderLeftColor: RED, background: "rgba(217,107,91,.08)", cursor: "default" }}>
          Precedence contains a cycle — no valid order exists. Balancing is blocked until it is broken.
        </div>
      ) : null}

      {a.overTaktElements.length > 0 ? (
        <div className="issue" style={{ marginBottom: 10, borderLeftColor: AMBER, background: "rgba(224,164,88,.08)", cursor: "default" }}>
          {a.overTaktElements.map((e) => e.name).join(", ")} exceed{a.overTaktElements.length === 1 ? "s" : ""} takt alone —
          no balance can fit {a.overTaktElements.length === 1 ? "it" : "them"} on one station. Split, automate or parallel.
        </div>
      ) : null}

      {a.issues.map((msg, i) => (
        <div key={i} className="issue" style={{ marginBottom: 8, cursor: "default" }}>{msg}</div>
      ))}

      {/* Inference is auditable, not magic — §5: every number says where it came from. */}
      {derived ? (
        <div className="card" style={{ marginBottom: 10, borderLeft: `2px solid ${AMBER}` }}>
          <div style={{ fontSize: 11.5, color: TEXT }}>
            Derived from stations · {derived.matchRatePct.toFixed(0)}% of names matched a capability
          </div>
          {derived.unmatched.length > 0 ? (
            <div style={{ fontSize: 10.5, color: AMBER, marginTop: 4 }}>
              No keyword matched: {derived.unmatched.join(", ")} — defaults applied, rename or correct them.
            </div>
          ) : null}
          <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 4 }}>
            {derived.notes.length} value{derived.notes.length === 1 ? "" : "s"} inferred, all at low confidence.
            Precedence was assumed linear.
          </div>
          <button className="btn" style={{ marginTop: 8, color: TEXTD }} onClick={() => setDerived(null)}>Dismiss</button>
        </div>
      ) : null}

      {/* --- the elements --- */}
      {elements.map((el) => {
        const load = a.elements.find((l) => l.elementId === el.id);
        const open = openId === el.id;
        return (
          <div key={el.id} className="card" style={{ borderLeft: `2px solid ${CLASS_COL[el.classification]}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setOpenId(open ? null : el.id)}>
              <span style={{ flex: 1, fontSize: 12, color: TEXT }}>
                <ConfidenceDot c={el.time.confidence} />{el.name}
              </span>
              <span style={{ fontSize: 11, color: TEXTD }}>
                {load ? `${load.weightedSec.toFixed(1)}s` : `${el.time.seconds}s`}
              </span>
              <span className="pill" style={{ background: "rgba(255,255,255,.05)", color: CLASS_COL[el.classification] }}>{el.classification}</span>
            </div>

            {open ? (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <label style={{ fontSize: 11, color: TEXTD }}>
                  Name
                  <input value={el.name} onChange={(e) => patch(el.id, { name: e.target.value })} />
                </label>

                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ fontSize: 11, color: TEXTD, flex: 1 }}>
                    Seconds
                    <input
                      type="number" min={0} step={0.1} value={el.time.seconds}
                      onChange={(e) => patch(el.id, { time: { ...el.time, seconds: Math.max(0, num(e.target.value, el.time.seconds)) } })}
                    />
                  </label>
                  <label style={{ fontSize: 11, color: TEXTD, flex: 1 }}>
                    Attended
                    <input
                      type="number" min={0} max={1} step={0.1} value={el.attendedFraction}
                      onChange={(e) => patch(el.id, { attendedFraction: Math.min(1, Math.max(0, num(e.target.value, el.attendedFraction))) })}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ fontSize: 11, color: TEXTD, flex: 1 }}>
                    Method
                    <select value={el.time.method} onChange={(e) => patch(el.id, { time: { ...el.time, method: e.target.value as TimeMethod } })}>
                      {TIME_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, color: TEXTD, flex: 1 }}>
                    Confidence
                    <select value={el.time.confidence} onChange={(e) => patch(el.id, { time: { ...el.time, confidence: e.target.value as Confidence } })}>
                      {CONFIDENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                </div>

                <label style={{ fontSize: 11, color: TEXTD }}>
                  Classification
                  <select value={el.classification} onChange={(e) => patch(el.id, { classification: e.target.value as WorkClass })}>
                    {WORK_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label style={{ fontSize: 11, color: TEXTD }}>
                  Predecessors (DAG — not a linear routing)
                  <select
                    multiple value={el.predecessors} style={{ height: 72 }}
                    onChange={(e) => patch(el.id, { predecessors: Array.from(e.target.selectedOptions, (o) => o.value) })}
                  >
                    {elements.filter((o) => o.id !== el.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>

                {load && load.skippedInModeIds.length > 0 ? (
                  <div style={{ fontSize: 10.5, color: AMBER }}>Skipped in {load.skippedInModeIds.length} mode(s)</div>
                ) : null}

                <button
                  className="btn" style={{ color: RED, justifySelf: "start" }}
                  onClick={() => { api.commit({ type: "DELETE_WORK_ELEMENT", id: el.id }); setOpenId(null); }}
                >
                  Delete element
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      <button className="btn" style={{ marginTop: 10, color: TEAL }} onClick={add}>Add element</button>

      {/* --- mix modes --- */}
      <div className="lab" style={{ margin: "18px 0 8px" }}>Mix modes</div>
      {a.modes.map((m) => (
        <div key={m.modeId} className="card" style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
          <span style={{ color: m.modeId === a.worstModeId ? AMBER : TEXT }}>
            {m.name}{m.modeId === a.worstModeId && a.modes.length > 1 ? " · heaviest" : ""}
          </span>
          <span style={{ color: TEXTD }}>{(m.share * 100).toFixed(0)}% · {m.totalSec.toFixed(1)}s</span>
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 6, lineHeight: 1.5 }}>
        Forty part numbers needing the same work are one mode. A mode exists only
        where work content genuinely differs — it carries no product identity.
      </div>
    </div>
  );
}
