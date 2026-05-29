import { useCallback, useEffect, useRef, useState } from "react";
import { useFlowPlan } from "./store/useFlowPlan";
import { SAMPLE, blankModel } from "./model/sample";
import { parseModelText, downloadJSON } from "./io/json";
import { downloadKpiCsv } from "./io/csv";
import { LayoutCanvas, type CanvasMode } from "./components/LayoutCanvas";
import { EmptyState } from "./components/EmptyState";
import { useToast } from "./components/ui";
import {
  AutomationPanel,
  BalancePanel,
  ConfigurePanel,
  FlowPanel,
  RatingPanel,
  SchemaPanel,
  type PanelProps,
  type Tab,
} from "./components/panels";
import { AMBER, TEAL, TEALD, TEXTD } from "./components/colors";

type View = "actual" | "improved" | "split";
const CELL = 30;

export function App() {
  const api = useFlowPlan();
  const { toast } = useToast();
  const [view, setView] = useState<View>("actual");
  const [tab, setTab] = useState<Tab>("rating");
  const [selId, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [flowFirst, setFlowFirst] = useState<string | null>(null);
  const [showOnboard, setShowOnboard] = useState(() => !localStorage.getItem("flowplan_model"));
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { model, rating } = api;

  const selectAndInspect = useCallback((id: string | null) => {
    setSel(id);
    if (id) setTab("inspect");
  }, []);

  // ---- flow drawing: pick source then target
  const pickStation = useCallback(
    (id: string) => {
      if (!flowFirst) {
        setFlowFirst(id);
        toast("Now tap the target step");
        return;
      }
      if (flowFirst !== id) {
        api.commit({ type: "ADD_FLOW", from: flowFirst, to: id });
        toast("Flow " + flowFirst + " → " + id + " added");
      }
      setFlowFirst(null);
    },
    [flowFirst, api, toast],
  );

  // ---- import
  const importFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const res = parseModelText(String(rd.result));
        if (res.ok && res.model) {
          api.reset(res.model);
          setSel(null);
          setView("actual");
          setShowOnboard(false);
          toast("Loaded “" + res.model.name + "”");
        } else {
          toast(res.error || "Import failed", "err");
        }
      };
      rd.onerror = () => toast("File read failed", "err");
      rd.readAsText(f);
      e.target.value = "";
    },
    [api, toast],
  );

  // ---- keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) api.redo();
        else api.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        api.redo();
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        setMode("select");
        setFlowFirst(null);
        setSel(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selId) {
        e.preventDefault();
        api.commit({ type: "DELETE_STATION", id: selId });
        setSel(null);
        return;
      }
      if (e.key === "1") setView("actual");
      if (e.key === "2") setView("improved");
      if (e.key === "3") setView("split");
      const s = model.stations.find((x) => x.id === selId);
      if (s && !s.fixed && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        api.commit({ type: "MOVE_STATION", id: s.id, x: s.x + dx, y: s.y + dy });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api, selId, model.stations]);

  const panelProps: PanelProps = { api, selId, setSel, setTab, setView, mode, setMode };

  function vBtn(k: View, l: string) {
    return (
      <button className={"btn" + (view === k ? " on" : "")} onClick={() => setView(k)}>
        {l}
      </button>
    );
  }
  function tBtn(k: Tab, l: string) {
    return (
      <button className={"btn" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
        {l}
      </button>
    );
  }

  const improvedModel = { ...model, stations: rating.optimized };

  let canvasInner;
  if (view === "actual") {
    canvasInner = (
      <div>
        <LayoutCanvas
          model={model}
          stations={model.stations}
          flows={model.flows}
          chain={api.chain}
          ghost={rating.optimized}
          selId={selId}
          label="ACTUAL"
          badge={TEAL}
          cell={CELL}
          interactive
          mode={mode}
          flowFirst={flowFirst}
          onSelect={selectAndInspect}
          onMoveStart={api.checkpoint}
          onMove={(id, x, y) => api.live({ type: "MOVE_STATION", id, x, y })}
          onPickStation={pickStation}
          onAddNoGo={(z) => { api.commit({ type: "ADD_NOGO", zone: z }); toast("No-go zone added"); }}
        />
        <div className="hint">
          {mode === "flow"
            ? "Flow mode: tap a source step then a target. Esc to exit."
            : mode === "nogo"
              ? "No-go mode: drag a rectangle. Esc to exit."
              : "Drag movable stations · scroll to zoom · amber dashed = improved position · tap to configure"}
        </div>
      </div>
    );
  } else if (view === "improved") {
    canvasInner = (
      <div>
        <LayoutCanvas model={improvedModel} stations={rating.optimized} flows={model.flows} chain={api.chain} selId={selId} label="IMPROVED" badge={AMBER} cell={CELL} onSelect={selectAndInspect} />
        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEAL }}>−{rating.flowReductionPct.toFixed(0)}% flow cost vs actual</span>
          {rating.moves.length > 0 ? (
            <button
              className="btn"
              style={{ borderColor: TEALD, color: TEAL }}
              onClick={() => { api.commit({ type: "ADOPT_STATIONS", stations: rating.optimized }); setView("actual"); toast("Improved layout adopted"); }}
            >
              Adopt as new actual
            </button>
          ) : (
            <span style={{ fontSize: 12, color: TEXTD }}>Already optimal — no moves found.</span>
          )}
        </div>
      </div>
    );
  } else {
    canvasInner = (
      <div className="splitWrap">
        <LayoutCanvas model={model} stations={model.stations} flows={model.flows} chain={api.chain} selId={selId} label="ACTUAL" badge={TEAL} cell={CELL - 4} onSelect={setSel} />
        <LayoutCanvas model={improvedModel} stations={rating.optimized} flows={model.flows} chain={api.chain} selId={selId} label="IMPROVED" badge={AMBER} cell={CELL - 4} onSelect={setSel} />
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <div className="logo">
          FLOW<span>PLAN</span>
        </div>
        <div className="views">
          {vBtn("actual", "● Actual")}
          {vBtn("improved", "◇ Improved")}
          {vBtn("split", "⇄ Both")}
        </div>
        <div className="spacer" />
        <span className="modelName" style={{ fontSize: 11, color: TEXTD }}>
          {model.name}
        </span>
        <button className="btn sm" onClick={api.undo} disabled={!api.canUndo} title="Undo (Ctrl/Cmd+Z)">
          ↺
        </button>
        <button className="btn sm" onClick={api.redo} disabled={!api.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
          ↻
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Load
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={importFile} style={{ display: "none" }} />
        <button className="btn" onClick={() => downloadJSON(model)}>
          Export
        </button>
        <button className="btn" onClick={() => downloadKpiCsv(model)} title="Export KPI + automation tables as CSV">
          CSV
        </button>
        <button className="btn" onClick={() => { if (confirm("Reset to the sample layout? Your current changes will be lost (unless exported or saved as a scenario).")) { api.reset(SAMPLE); setSel(null); setView("actual"); } }}>
          Reset
        </button>
      </header>

      <main>
        <div className="canvas">
          {canvasInner}
          <div className="legend">
            <span>
              role outline: <span style={{ color: TEAL }}>▢</span>input <span style={{ color: AMBER }}>▢</span>output
            </span>
            <span>dots: ergo (TL) · automation (TR)</span>
            <span>
              links: <span style={{ color: TEAL }}>━</span>chained <span style={{ color: "#d96b5b" }}>┅</span>auto-island <span style={{ color: AMBER }}>┅</span>mixed
            </span>
          </div>
        </div>
        <div className="side">
          <div className="tabs">
            {tBtn("rating", "Rating")}
            {tBtn("balance", "Balance")}
            {tBtn("flow", "Flow")}
            {tBtn("auto", "Automation")}
            {tBtn("inspect", "Configure")}
            {tBtn("schema", "Schema")}
          </div>
          {tab === "rating" && <RatingPanel {...panelProps} />}
          {tab === "balance" && <BalancePanel {...panelProps} />}
          {tab === "flow" && <FlowPanel {...panelProps} />}
          {tab === "auto" && <AutomationPanel {...panelProps} />}
          {tab === "inspect" && <ConfigurePanel {...panelProps} />}
          {tab === "schema" && <SchemaPanel />}
        </div>
      </main>

      {showOnboard ? (
        <EmptyState
          onSample={() => { api.reset(SAMPLE); setShowOnboard(false); }}
          onBlank={() => { api.reset(blankModel()); setShowOnboard(false); setTab("flow"); }}
          onImport={() => fileRef.current?.click()}
        />
      ) : null}
    </div>
  );
}
