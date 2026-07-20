import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { ProcessShell } from "./planner/ProcessShell";
import { SituationStep, DemandStep, ProcessStepView, ConceptsStep, SummaryStep, type DemandValues } from "./planner/steps";
import { FLOW_STEPS, reachedThrough, widen, type FlowStep } from "./planner/flow";
import { parseSteps } from "./planner/parseSteps";
import { COMPLEXITY_SEC, USE_CASES, type CycleKnowledge, type UseCaseId } from "./planner/usecases";
import { DEFAULT_PROGRAM_YEARS, generateCandidates, rankCandidates, type GenerateBrief, type ProcessStep as CoreStep } from "@flowplan/core/engine/generate";
import { Button } from "@carbon/react";
import { HeaderKpis } from "./components/HeaderKpis";
import { SettingsModal } from "./components/SettingsModal";
import { FlowEditorPopover } from "./components/FlowEditorPopover";
import { Explorer } from "./components/Explorer";
import { Resizer } from "./components/Resizer";
import { ComparePage } from "./pages/ComparePage";
import { SitePage } from "./pages/SitePage";
import { ArchivePage } from "./pages/ArchivePage";
import { AdminPage } from "./pages/AdminPage";
import { useHashRoute, navigate } from "./store/useHashRoute";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { StationTooltip } from "./components/StationTooltip";
import { AiChatPanel } from "./components/AiChatPanel";
import { ProposalPanel } from "./components/ProposalPanel";
import { WorkloadPanel } from "./components/WorkloadPanel";
import { makePlacementProposal } from "@flowplan/core/engine/proposal";
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
import { AMBER, TEAL, TEXTD } from "./components/colors";

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
    // Workload leads: the spec's flow is workload → balancer → stations (§11),
    // so the product-free input comes before the things derived from it.
    { tab: "workload", label: "Workload" },
    { tab: "flow", label: "Flow" },
    { tab: "inspect", label: "Configure" },
  ] },
  { id: "automation", label: "Automation", tabs: [{ tab: "auto", label: "Automation" }] },
  { id: "chat", label: "AI Chat", tabs: [{ tab: "chat", label: "💬 AI Chat" }] },
];
const GROUP_OF: Record<Tab, Group | undefined> = {
  rating: "insights", balance: "insights", cost: "insights",
  workload: "build", flow: "build", inspect: "build",
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
  const [proposalDismissed, setProposalDismissed] = useState(false);
  const hadModel = !!localStorage.getItem("flowplan_model");
  const [step, setStep] = useState<FlowStep>(hadModel ? "refine" : "situation");
  const [reached, setReached] = useState<FlowStep[]>(hadModel ? FLOW_STEPS.slice() : ["situation"]);
  const goTo = useCallback((s: FlowStep) => {
    setStep(s);
    setReached((r) => widen(r, reachedThrough(s)));
  }, []);
  // ---- planning brief (lifted out of the planner so the stepper owns it) ----
  const [useCaseId, setUseCaseId] = useState<UseCaseId | null>(null);
  const [demand, setDemand] = useState<DemandValues>({ name: "New product", annualVolume: 250000, programYears: DEFAULT_PROGRAM_YEARS, annualShifts: 460, shiftHours: 8 });
  const [knowledge, setKnowledge] = useState<CycleKnowledge>("known");
  const [paste, setPaste] = useState("Load blank\t15\nPress\t35\nWeld\t60\nLeak test\t25\nPack\t20");
  const [stepNames, setStepNames] = useState("Load blank\nPress\nWeld\nLeak test\nPack");
  const [complexity, setComplexity] = useState("moderate");
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Which candidate has already been loaded into the workspace, so advancing
  // to Refine twice does not create duplicate cells.
  const loadedCandidate = useRef<string | null>(null);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [route] = useHashRoute();
  // Collapsible in-layout sidebars (persisted). Left = workspace Explorer, right = config panel.
  const [explorerCollapsed, setExplorerCollapsed] = useState(() => localStorage.getItem("flowplan_explorer_collapsed") === "1");
  const [configCollapsed, setConfigCollapsed] = useState(() => localStorage.getItem("flowplan_config_collapsed") === "1");
  useEffect(() => { localStorage.setItem("flowplan_explorer_collapsed", explorerCollapsed ? "1" : "0"); }, [explorerCollapsed]);
  useEffect(() => { localStorage.setItem("flowplan_config_collapsed", configCollapsed ? "1" : "0"); }, [configCollapsed]);
  // Drag-resizable sidebar widths (persisted).
  const numOr = (k: string, d: number) => { const n = Number(localStorage.getItem(k)); return Number.isFinite(n) && n > 0 ? n : d; };
  const [explorerWidth, setExplorerWidth] = useState(() => numOr("flowplan_explorer_w", 300));
  const [configWidth, setConfigWidth] = useState(() => numOr("flowplan_config_w", 360));
  useEffect(() => { localStorage.setItem("flowplan_explorer_w", String(explorerWidth)); }, [explorerWidth]);
  useEffect(() => { localStorage.setItem("flowplan_config_w", String(configWidth)); }, [configWidth]);
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

  // ---- derived planning data ----------------------------------------------
  const briefSteps: CoreStep[] = useMemo(() => {
    if (knowledge === "known") return parseSteps(paste);
    const sec = COMPLEXITY_SEC[complexity] ?? 35;
    return stepNames
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((n) => ({ name: n, cycleTimeSec: sec }));
  }, [knowledge, paste, stepNames, complexity]);

  const brief: GenerateBrief = { ...demand, steps: briefSteps };
  const perShift = demand.annualShifts > 0 ? demand.annualVolume / demand.annualShifts : 0;

  const candidates = useMemo(
    () => (step === "concepts" || step === "summary" ? rankCandidates(generateCandidates(brief)) : []),
    [step, demand, briefSteps],
  );
  const picked = candidates.find((c) => c.id === pickedId) ?? candidates[0] ?? null;
  const useCase = useCaseId ? USE_CASES.find((u) => u.id === useCaseId) ?? null : null;

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
          goTo("refine");
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
        if (showSettings) {
          setShowSettings(false);
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
  }, [api, selId, model.stations, showSettings]);

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

  // §4: the optimizer's output is a proposal, not a write. Recomputed with the
  // rating; dismissal is cleared whenever a genuinely new one appears.
  const proposal = useMemo(() => makePlacementProposal(model, rating), [model, rating]);
  useEffect(() => { setProposalDismissed(false); }, [proposal?.baseSignature]);

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
          proposalItems={proposal?.items}
          onAcceptMove={(id) => {
            if (!proposal) return;
            api.commit({ type: "ACCEPT_PROPOSAL", items: proposal.items, itemIds: [id] });
            toast(`${proposal.items.find((i) => i.stationId === id)?.name ?? "Move"} accepted`);
          }}
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
        {/* §4: the proposal annotates the canvas it belongs to; the per-item
            accept is the ghost itself, not a control in this strip. */}
        {proposal && !proposalDismissed ? (
          <ProposalPanel
            proposal={proposal}
            model={model}
            onAcceptAll={() => {
              api.commit({ type: "ACCEPT_PROPOSAL", items: proposal.items, itemIds: proposal.items.map((i) => i.stationId) });
              toast(`${proposal.items.length} moves accepted`);
            }}
            onDismiss={() => setProposalDismissed(true)}
          />
        ) : null}
        <div className="hint">
          {mode === "flow"
            ? "Flow mode: tap a source step then a target. Esc to exit."
            : mode === "nogo"
              ? "No-go mode: drag a rectangle. Esc to exit."
              : proposal && !proposalDismissed
                ? "Drag movable stations · scroll to zoom · click an amber dashed ghost to accept that move · tap to configure"
                : "Drag movable stations · scroll to zoom · tap to configure"}
        </div>
      </div>
    );
  } else if (view === "improved") {
    canvasInner = (
      <div>
        <LayoutCanvas model={improvedModel} stations={rating.optimized} flows={model.flows} chain={api.chain} selId={selId} label="IMPROVED" badge={AMBER} cell={CELL} onSelect={selectAndInspect} />
        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: TEAL }}>−{rating.flowReductionPct.toFixed(0)}% flow cost vs actual</span>
        </div>
        <div style={{ fontSize: 12, color: TEXTD, marginTop: 10 }}>
          {proposal
            ? `${proposal.items.length} proposed move${proposal.items.length === 1 ? "" : "s"} — switch to Actual to accept them on the canvas.`
            : "Already optimal — no moves to propose."}
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

  // Dedicated pages (hash routes). They render full-screen with their own back
  // navigation; all hooks above have already run, so these early returns are safe.
  if (route === "/compare") return <div className="wrap"><ComparePage api={api} /></div>;
  if (route === "/site") return <div className="wrap"><SitePage api={api} /></div>;
  if (route === "/archive") return <div className="wrap"><ArchivePage api={api} /></div>;
  if (route === "/admin") return <div className="wrap"><AdminPage /></div>;

  const editorToolbar = (
    <div className="editorbar">
      <HeaderKpis api={api} />
      <div className="spacer" />
      <Button size="sm" kind="primary" onClick={() => goTo("summary")}>
        Continue to summary
      </Button>
      <span className="hsep" />
        <button
          className={"btn sm" + (explorerCollapsed ? "" : " on")}
          onClick={() => setExplorerCollapsed((v) => !v)}
          title="Toggle the workspace sidebar"
          style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          🗂 {api.cells.find((c) => c.id === api.activeId)?.name ?? "Layouts"}
        </button>
        <button className="btn sm" onClick={() => navigate("/site")} title="Site overview across all layouts">
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
            { label: "Compare scenarios", onClick: () => navigate("/compare") },
            { label: "Site overview", onClick: () => navigate("/site") },
            { label: "Archived items", onClick: () => navigate("/archive") },
            { label: "Admin (teams & workspaces)", onClick: () => navigate("/admin") },
            {
              label: "Reset to sample",
              danger: true,
              onClick: () => setShowReset(true),
            },
          ]}
        />
    </div>
  );

  const editorBody = (
      <main>
        <aside
          className={"explorer-side" + (explorerCollapsed ? " collapsed" : "")}
          style={explorerCollapsed ? undefined : { flexBasis: explorerWidth, width: explorerWidth }}
        >
          {explorerCollapsed ? (
            <div className="rail">
              <button className="btn sm rail-btn" onClick={() => setExplorerCollapsed(false)} title="Show workspace sidebar">
                🗂 Workspace
              </button>
            </div>
          ) : (
            <Explorer api={api} onCollapse={() => setExplorerCollapsed(true)} />
          )}
        </aside>
        {explorerCollapsed ? null : <Resizer edge="right" width={explorerWidth} setWidth={setExplorerWidth} />}
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
        {configCollapsed ? null : <Resizer edge="left" width={configWidth} setWidth={setConfigWidth} />}
        <div
          className={"side" + (configCollapsed ? " collapsed" : "")}
          style={configCollapsed ? undefined : { flexBasis: configWidth, width: configWidth }}
        >
          {configCollapsed ? (
            <div className="rail">
              <button className="btn sm rail-btn" onClick={() => setConfigCollapsed(false)} title="Show config panel">
                ⚙ Config
              </button>
            </div>
          ) : (
          <>
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
              <button className="btn help-tab" title="Collapse config panel" onClick={() => setConfigCollapsed(true)}>
                ▶
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
          {tab === "workload" && <WorkloadPanel {...panelProps} />}
          {tab === "flow" && <FlowPanel {...panelProps} />}
          {tab === "auto" && <AutomationPanel {...panelProps} />}
          {tab === "inspect" && <ConfigurePanel {...panelProps} />}
          {tab === "cost" && <CostPanel {...panelProps} />}
          {tab === "chat" && <AiChatPanel api={api} settings={settings} openSettings={() => setShowSettings(true)} />}
          {tab === "schema" && <SchemaPanel />}
          </>
          )}
        </div>
      </main>
  );

  const stepNav = (
    <div className="planner__actions">
      <Button
        kind="secondary"
        onClick={() => goTo(FLOW_STEPS[Math.max(0, FLOW_STEPS.indexOf(step) - 1)])}
        disabled={step === "situation"}
      >
        Back
      </Button>
      <Button
        onClick={() => {
          // Leaving Concepts loads the chosen candidate, so Refine edits the
          // generated cell rather than whatever was open before.
          if (step === "concepts" && picked && loadedCandidate.current !== picked.id) {
            api.addCell(picked.model, picked.model.name);
            loadedCandidate.current = picked.id;
            setSel(null);
            setView("actual");
            setTab("rating");
            toast(`Loaded ${picked.conceptLabel} (${picked.form}-form).`);
          }
          goTo(FLOW_STEPS[Math.min(FLOW_STEPS.length - 1, FLOW_STEPS.indexOf(step) + 1)]);
        }}
        disabled={
          step === "summary" ||
          (step === "demand" && !(demand.annualVolume > 0)) ||
          (step === "process" && briefSteps.length === 0) ||
          (step === "concepts" && !picked)
        }
      >
        {step === "concepts" ? "Refine this layout" : "Continue"}
      </Button>
    </div>
  );

  return (
    <ProcessShell step={step} reached={reached} onGoto={goTo}>
      {step === "situation" ? (
        <SituationStep
          hasCell={api.cells.length > 0}
          onSkip={() => goTo("refine")}
          onPick={(id) => { setUseCaseId(id); const uc = USE_CASES.find((u) => u.id === id); goTo(uc && uc.steps.length > 1 ? "demand" : "refine"); }}
          onSample={() => { api.reset(SAMPLE); goTo("refine"); }}
          onBlank={() => { api.reset(blankModel()); setTab("flow"); goTo("refine"); }}
          onImport={() => fileRef.current?.click()}
        />
      ) : null}

      {step === "demand" ? <DemandStep values={demand} onChange={(patch) => setDemand((d) => ({ ...d, ...patch }))} /> : null}

      {step === "process" ? (
        <ProcessStepView
          knowledge={knowledge}
          setKnowledge={setKnowledge}
          paste={paste}
          setPaste={setPaste}
          names={stepNames}
          setNames={setStepNames}
          complexity={complexity}
          setComplexity={setComplexity}
          steps={briefSteps}
        />
      ) : null}

      {step === "concepts" ? (
        <ConceptsStep
          candidates={candidates}
          selectedId={picked?.id ?? null}
          onSelect={setPickedId}
          perShift={perShift}
          programYears={demand.programYears}
        />
      ) : null}

      {step === "refine" ? (
        <>
          {editorToolbar}
          {editorBody}
        </>
      ) : null}

      {step === "summary" ? <SummaryStep picked={picked} useCase={useCase} /> : null}

      {step !== "refine" ? stepNav : null}

      {hover ? <StationTooltip station={hover.station} x={hover.x} y={hover.y} shiftHours={model.shiftHours ?? 8} /> : null}

      {showSettings ? (
        <SettingsModal initial={settings} onClose={() => setShowSettings(false)} onSaved={setSettings} />
      ) : null}
      {showReset ? (
        <ConfirmDialog
          title="Reset to sample"
          message="Reset to the sample layout? Your current changes will be lost (unless exported or saved as a scenario)."
          confirmLabel="Reset"
          danger
          onConfirm={() => { api.reset(SAMPLE); setSel(null); setView("actual"); }}
          onClose={() => setShowReset(false)}
        />
      ) : null}

      <input ref={fileRef} type="file" accept=".json,application/json" onChange={importFile} style={{ display: "none" }} />
    </ProcessShell>
  );
}
