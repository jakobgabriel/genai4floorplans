import { useCallback, useEffect, useRef, useState } from "react";
import { useFlowPlan } from "./store/useFlowPlan";
import { SAMPLE, blankModel } from "@flowplan/core/model/sample";
import { parseModelText } from "@flowplan/core/io/json";
import { downloadJSON } from "./io/download";
import { downloadKpiCsv } from "./io/csv";
import { downloadLayoutPNG } from "./io/image";
import { openReport } from "./io/report";
import { cloneStation } from "@flowplan/core/store/reducer";
import type { Station } from "@flowplan/core/model/types";
import { loadSettings, type Settings } from "./store/settings";
import { LayoutCanvas, type CanvasMode } from "./components/LayoutCanvas";
import { EmptyState } from "./components/EmptyState";
import { SettingsModal } from "./components/SettingsModal";
import { ScenarioCompare } from "./components/ScenarioCompare";
import { FlowEditorPopover } from "./components/FlowEditorPopover";
import { SiteRollup } from "./components/SiteRollup";
import { StationTooltip } from "./components/StationTooltip";
import { AiChatPanel } from "./components/AiChatPanel";
import { CostPanel } from "./components/CostPanel";
import { DagView } from "./components/DagView";
import { Menu } from "./components/Menu";
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

type View = "actual" | "improved" | "split" | "dag";
const CELL = 30;

// Side-panel tabs grouped for a calmer rail: one button per group, plus a slim
// sub-tab row when a group has >1 panel. Schema is reached via the "?" help icon.
type Group = "insights" | "build" | "automation" | "chat";
const TAB_GROUPS: { id: Group; label: string; tabs: { tab: Tab; label: string }[] }[] = [
  { id: "insights", label: "Insights", tabs: [
    { tab: "rating", label: "Rating" },
    { tab: "balance", label: "Balance" },
    { tab: "cost", label: "Cost" },
  ] },
  { id: "build", label: "Build", tabs: [
    { tab: "flow", label: "Flow" },
    { tab: "inspect", label: "Configure" },
  ] },
  { id: "automation", label: "Automation", tabs: [{ tab: "auto", label: "Automation" }] },
  { id: "chat", label: "AI Chat", tabs: [{ tab: "chat", label: "💬 AI Chat" }] },
];
const GROUP_OF: Record<Tab, Group | undefined> = {
  rating: "insights", balance: "insights", cost: "insights",
  flow: "build", inspect: "build",
  auto: "automation", chat: "chat", schema: undefined,
};

export function App() {
  const api = useFlowPlan();
  const { toast } = useToast();
  const [view, setView] = useState<View>("actual");
  const [tab, setTab] = useState<Tab>("rating");
  const [selId, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [flowFirst, setFlowFirst] = useState<string | null>(null);
  const [selFlow, setSelFlow] = useState<{ from: string; to: string } | null>(null);
  const [hover, setHover] = useState<{ station: Station; x: number; y: number } | null>(null);
  const [showOnboard, setShowOnboard] = useState(() => !localStorage.getItem("flowplan_model"));
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showRollup, setShowRollup] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const clipboard = useRef<Station | null>(null);
  // Remember the last sub-tab visited per group, so returning to a group restores it.
  const lastSubTab = useRef<Record<Group, Tab>>({ insights: "rating", build: "flow", automation: "auto", chat: "chat" });

  const { model, rating } = api;

  const selectAndInspect = useCallback((id: string | null) => {
    setSel(id);
    if (id) setTab("inspect");
  }, []);

  // Keep the per-group memory in sync however the tab changed (incl. in-panel
  // deep-links like Balance → Configure), so re-opening a group restores it.
  useEffect(() => {
    const g = GROUP_OF[tab];
    if (g) lastSubTab.current[g] = tab;
  }, [tab]);

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
      if (mod && e.key.toLowerCase() === "d" && selId) {
        e.preventDefault();
        const src = model.stations.find((x) => x.id === selId);
        if (src) {
          const clone = cloneStation(model, src);
          api.commit({ type: "ADD_STATION", station: clone });
          setSel(clone.id);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "c" && selId) {
        const src = model.stations.find((x) => x.id === selId);
        if (src) clipboard.current = src;
        return;
      }
      if (mod && e.key.toLowerCase() === "v" && clipboard.current) {
        e.preventDefault();
        const clone = cloneStation(model, clipboard.current);
        api.commit({ type: "ADD_STATION", station: clone });
        setSel(clone.id);
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        if (showSettings || showCompare) {
          setShowSettings(false);
          setShowCompare(false);
          return;
        }
        setMode("select");
        setFlowFirst(null);
        setSel(null);
        setSelFlow(null);
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
      if (e.key === "4") setView("dag");
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
  }, [api, selId, model.stations, showSettings, showCompare]);

  const panelProps: PanelProps = { api, selId, setSel, setTab, setView, mode, setMode };

  function vBtn(k: View, l: string) {
    return (
      <button className={"btn" + (view === k ? " on" : "")} onClick={() => setView(k)}>
        {l}
      </button>
    );
  }
  // The active group follows the active tab (so in-panel deep-links to Configure
  // still light up the right group). Schema (via "?") belongs to no group.
  const activeGroup = GROUP_OF[tab];
  function selectGroup(g: Group) {
    setTab(lastSubTab.current[g]);
  }
  function selectSubTab(g: Group, k: Tab) {
    lastSubTab.current[g] = k;
    setTab(k);
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
          selFlow={selFlow}
          criticalPath={rating.balance.criticalPath}
          onSelect={selectAndInspect}
          onSelectFlow={setSelFlow}
          onHoverStation={(s, x, y) => setHover(s ? { station: s, x, y } : null)}
          onMoveStart={api.checkpoint}
          onMove={(id, x, y) => api.live({ type: "MOVE_STATION", id, x, y })}
          onPickStation={pickStation}
          onAddNoGo={(z) => { api.commit({ type: "ADD_NOGO", zone: z }); toast("No-go zone added"); }}
        />
        {selFlow ? <FlowEditorPopover api={api} flow={selFlow} onClose={() => setSelFlow(null)} /> : null}
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
  } else if (view === "dag") {
    canvasInner = <DagView model={model} chain={api.chain} selId={selId} onSelect={selectAndInspect} criticalPath={rating.balance.criticalPath} />;
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
        <div className="spacer" />
        <select
          className="cellSwitch"
          value={api.activeId}
          onChange={(e) => {
            if (e.target.value === "__add") api.addCell(blankModel());
            else api.switchCell(e.target.value);
          }}
          title="Switch cell"
          style={{ width: "auto", maxWidth: 180 }}
        >
          {api.cells.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__add">＋ New cell…</option>
        </select>
        <button className="btn sm" onClick={() => setShowRollup(true)} title="Site rollup across all cells">
          Site
        </button>
        <span className="hsep" />
        <button className="btn sm" onClick={api.undo} disabled={!api.canUndo} title="Undo (Ctrl/Cmd+Z)">
          ↺
        </button>
        <button className="btn sm" onClick={api.redo} disabled={!api.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
          ↻
        </button>
        <span className="hsep" />
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={importFile} style={{ display: "none" }} />
        <Menu
          label="Export ▾"
          title="Load, export & report"
          items={[
            { label: "Load JSON…", onClick: () => fileRef.current?.click() },
            { label: "Export JSON", onClick: () => downloadJSON(model) },
            { label: "Export CSV", onClick: () => downloadKpiCsv(model) },
            {
              label: "Export PNG",
              onClick: async () => {
                const ok = await downloadLayoutPNG("ACTUAL", (model.name || "layout").replace(/\s+/g, "_"));
                if (!ok) toast("Switch to the Actual view to export the layout", "warn");
              },
            },
            { label: "Open report", onClick: () => openReport(model) },
          ]}
        />
        <button className="btn" onClick={() => setShowSettings(true)} title="Settings">
          ⚙
        </button>
        <Menu
          label="⋯"
          title="More actions"
          items={[
            { label: "Compare scenarios", onClick: () => setShowCompare(true) },
            {
              label: "Reset to sample",
              danger: true,
              onClick: () => {
                if (confirm("Reset to the sample layout? Your current changes will be lost (unless exported or saved as a scenario).")) {
                  api.reset(SAMPLE);
                  setSel(null);
                  setView("actual");
                }
              },
            },
          ]}
        />
      </header>

      <main>
        <div className="canvas" style={{ position: "relative" }}>
          <div className="viewbar">
            <div className="views">
              {vBtn("actual", "● Actual")}
              {vBtn("improved", "◇ Improved")}
              {vBtn("split", "⇄ Both")}
              {vBtn("dag", "⊟ DAG")}
            </div>
          </div>
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
          <div className="tabbar">
            <div className="grouptabs">
              {TAB_GROUPS.map((g) => (
                <button key={g.id} className={"btn" + (activeGroup === g.id ? " on" : "")} onClick={() => selectGroup(g.id)}>
                  {g.label}
                </button>
              ))}
              <button className={"btn help-tab" + (tab === "schema" ? " on" : "")} title="Data model / schema reference" onClick={() => setTab("schema")}>
                ?
              </button>
            </div>
            {activeGroup && (TAB_GROUPS.find((g) => g.id === activeGroup)?.tabs.length ?? 0) > 1 ? (
              <div className="subtabs">
                {TAB_GROUPS.find((g) => g.id === activeGroup)!.tabs.map((t) => (
                  <button key={t.tab} className={"chip" + (tab === t.tab ? " on" : "")} onClick={() => selectSubTab(activeGroup, t.tab)}>
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {tab === "rating" && <RatingPanel {...panelProps} />}
          {tab === "balance" && <BalancePanel {...panelProps} />}
          {tab === "flow" && <FlowPanel {...panelProps} />}
          {tab === "auto" && <AutomationPanel {...panelProps} />}
          {tab === "inspect" && <ConfigurePanel {...panelProps} />}
          {tab === "cost" && <CostPanel {...panelProps} />}
          {tab === "chat" && <AiChatPanel api={api} settings={settings} openSettings={() => setShowSettings(true)} />}
          {tab === "schema" && <SchemaPanel />}
        </div>
      </main>

      {hover ? <StationTooltip station={hover.station} x={hover.x} y={hover.y} shiftHours={model.shiftHours ?? 8} /> : null}

      {showSettings ? (
        <SettingsModal initial={settings} onClose={() => setShowSettings(false)} onSaved={setSettings} />
      ) : null}
      {showCompare ? <ScenarioCompare api={api} onClose={() => setShowCompare(false)} /> : null}
      {showRollup ? <SiteRollup api={api} onClose={() => setShowRollup(false)} /> : null}

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
