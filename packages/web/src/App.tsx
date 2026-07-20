import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFlowPlan } from "./store/useFlowPlan";
import { SAMPLE, blankModel } from "@flowplan/core/model/sample";
import { parseModelText } from "@flowplan/core/io/json";
import { downloadJSON } from "./io/download";
import { downloadKpiCsv } from "./io/csv";
import { downloadLayoutPNG } from "./io/image";
import { openReport } from "./io/report";
import { cloneStation, makeStation } from "@flowplan/core/store/reducer";
import { NODE_KINDS } from "./components/PaletteBar";
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
import { Resizer } from "./components/Resizer";
import { LibrarySidebar } from "./components/LibrarySidebar";
import { ComparePage } from "./pages/ComparePage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { LibraryPage } from "./pages/LibraryPage";
import { SitePage } from "./pages/SitePage";
import { ArchivePage } from "./pages/ArchivePage";
import { AdminPage } from "./pages/AdminPage";
import { useHashRoute, navigate } from "./store/useHashRoute";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { StationTooltip } from "./components/StationTooltip";
import { ProposalPanel } from "./components/ProposalPanel";
import { WorkloadPanel } from "./components/WorkloadPanel";
import { makePlacementProposal } from "@flowplan/core/engine/proposal";
import { improvedLayout } from "@flowplan/core/engine/improved";
import { useSubflows, makeSubflow } from "./store/subflows";
import { useLibrary } from "./store/library";
import { catalogStationPatch } from "@flowplan/core/model/catalog";
import type { ZoneKind } from "@flowplan/core/model/types";
import { CostPanel } from "./components/CostPanel";
import { DataSheetPanel } from "./components/DataSheetPanel";
import { CapacityPanel } from "./components/CapacityPanel";
import { DagView } from "./components/DagView";
import { Menu } from "./components/Menu";
import { useToast } from "./components/ui";
import {
  AutomationPanel,
  BalancePanel,
  ConfigurePanel,
  FlowPanel,
  SchemaPanel,
  type PanelProps,
  type Tab,
} from "./components/panels";
import { AnalysisDashboard } from "./components/AnalysisDashboard";
import { StationDoc } from "./components/ElementDoc";
import { AMBER, TEAL, TEXTD } from "./components/colors";

type View = "actual" | "improved" | "split" | "dag" | "analysis";
type Overlay = "none" | "confidence" | "congestion";
const CELL = 30;

// The right rail carries INPUTS ONLY — configuration of steps and connections.
// Everything derived (rating, balance, cost, automation coherence, AI help)
// lives in the dedicated Analysis view, so the editor stays uncluttered.
const INPUT_TABS: { tab: Tab; label: string }[] = [
  { tab: "inspect", label: "Configure" },
  { tab: "flow", label: "Flow" },
  { tab: "workload", label: "Workload" },
];
const ANALYSIS_TABS: { tab: Tab; label: string }[] = [
  { tab: "rating", label: "Overview" },
  { tab: "balance", label: "Balance" },
  { tab: "datasheet", label: "Data sheet" },
  { tab: "capacity", label: "Capacity" },
  { tab: "cost", label: "Cost" },
  { tab: "auto", label: "Automation" },
  // AI Chat is hidden for now.
];

export function App() {
  const api = useFlowPlan();
  const { toast } = useToast();
  const subflows = useSubflows();
  const library = useLibrary();
  const [view, setView] = useState<View>("actual");
  const [tab, setTab] = useState<Tab>("inspect");
  const [analysisTab, setAnalysisTab] = useState<Tab>("rating");
  const [selId, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [flowFirst, setFlowFirst] = useState<string | null>(null);
  const [selFlow, setSelFlow] = useState<{ from: string; to: string } | null>(null);
  const [hover, setHover] = useState<{ station: Station; x: number; y: number } | null>(null);
  const [proposalDismissed, setProposalDismissed] = useState(false);
  const hadModel = !!localStorage.getItem("flowplan_model");
  const [step, setStep] = useState<FlowStep>(hadModel ? "refine" : "situation");
  const [reached, setReached] = useState<FlowStep[]>(hadModel ? FLOW_STEPS.slice() : ["situation"]);
  // Workspace-first: a returning user (one who already has a saved workspace)
  // lands on the Workspace, not straight in the editor. Brand-new users still
  // get the onboarding flow, then land in the editor; their next visit opens the
  // workspace. Runs once on mount, so navigating back to the editor is sticky.
  const didLand = useRef(false);
  useEffect(() => {
    if (didLand.current) return;
    didLand.current = true;
    const returning = !!localStorage.getItem("flowplan_workspace");
    const noRoute = !window.location.hash || window.location.hash === "#" || window.location.hash === "#/";
    if (returning && noRoute) navigate("/workspace");
  }, []);
  // Start the guided wizard for a new concept, from the workspace.
  const startGuided = useCallback(() => {
    setStep("situation");
    setReached(["situation"]);
    setView("actual");
    navigate("/");
  }, []);
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
  // Collapsible config panel (persisted). The workspace is now a global page.
  const [configCollapsed, setConfigCollapsed] = useState(() => localStorage.getItem("flowplan_config_collapsed") === "1");
  useEffect(() => { localStorage.setItem("flowplan_config_collapsed", configCollapsed ? "1" : "0"); }, [configCollapsed]);
  // Drag-resizable config width (persisted).
  const numOr = (k: string, d: number) => { const n = Number(localStorage.getItem(k)); return Number.isFinite(n) && n > 0 ? n : d; };
  const [configWidth, setConfigWidth] = useState(() => numOr("flowplan_config_w", 360));
  useEffect(() => { localStorage.setItem("flowplan_config_w", String(configWidth)); }, [configWidth]);
  // Left library sidebar (node-RED palette), collapsible + drag-resizable, persisted.
  const [libCollapsed, setLibCollapsed] = useState(() => localStorage.getItem("flowplan_lib_collapsed") === "1");
  useEffect(() => { localStorage.setItem("flowplan_lib_collapsed", libCollapsed ? "1" : "0"); }, [libCollapsed]);
  const [libWidth, setLibWidth] = useState(() => numOr("flowplan_lib_w", 260));
  useEffect(() => { localStorage.setItem("flowplan_lib_w", String(libWidth)); }, [libWidth]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const clipboard = useRef<Station | null>(null);

  const { model, rating } = api;

  // Selecting a step opens Configure in the editor. Only leave the Analysis view
  // (a deep-link back to the editor); staying in DAG/Improved when selecting a
  // node there is the expected behaviour.
  const selectAndInspect = useCallback((id: string | null) => {
    setSel(id);
    if (id) {
      setView((v) => (v === "analysis" ? "actual" : v));
      setTab("inspect");
    }
  }, []);

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
  // Analysis panels deep-link to inputs (e.g. Balance → Configure); wrap setTab
  // so those links also leave the Analysis view for the editor.
  const gotoInput = useCallback((t: Tab) => { setView("actual"); setTab(t); }, []);
  const analysisPanelProps: PanelProps = { ...panelProps, setTab: gotoInput, setSel: selectAndInspect };

  // The Improved view is a genuinely-better relayout (best cell form or a
  // reposition), not just pairwise swaps. Recomputed with the model.
  const improved = useMemo(() => improvedLayout(model), [model]);
  const improvedModel = { ...model, stations: improved.stations };

  // §4: the optimizer's output is a proposal, not a write. Recomputed with the
  // rating; dismissal is cleared whenever a genuinely new one appears.
  const proposal = useMemo(() => makePlacementProposal(model, rating), [model, rating]);
  useEffect(() => { setProposalDismissed(false); }, [proposal?.baseSignature]);

  // One drop handler for every draggable in the left library sidebar and the
  // palette: a station kind, a typed zone ("zone:*"), a library entry ("lib:*"),
  // or a grouped subflow ("sub:*").
  const dropElement = useCallback((kind: string, gx: number, gy: number) => {
    const place = (w: number, h: number) => ({
      x: Math.max(0, Math.min(model.gridW - w, Math.round(gx - w / 2))),
      y: Math.max(0, Math.min(model.gridH - h, Math.round(gy - h / 2))),
    });
    if (kind.startsWith("zone:")) {
      const zk = kind.slice(5) as ZoneKind;
      const w = 3, h = 2;
      api.commit({ type: "ADD_NOGO", zone: { ...place(w, h), w, h, kind: zk } });
      toast(`Placed ${zk} zone`);
      return;
    }
    if (kind.startsWith("lib:")) {
      const e = library.entries.find((x) => x.id === kind.slice(4));
      if (!e) return;
      const base = makeStation(model);
      const patch = catalogStationPatch(e) as Partial<Station>;
      const station = { ...base, ...patch, ...place(patch.w ?? base.w, patch.h ?? base.h) };
      api.commit({ type: "ADD_STATION", station });
      selectAndInspect(station.id);
      toast(`Added ${e.name}`);
      return;
    }
    if (kind.startsWith("sub:")) {
      const sf = subflows.subflows.find((s) => s.id === kind.slice(4));
      if (!sf) return;
      api.commit({ type: "INSERT_SUBFLOW", stations: sf.stations, flows: sf.flows, ...place(sf.w, sf.h) });
      toast(`Inserted “${sf.name}”`);
      return;
    }
    const nk = NODE_KINDS.find((k) => k.id === kind);
    if (!nk) return;
    const base = makeStation(model);
    const station = { ...base, type: nk.type, role: nk.role, name: nk.label, ...place(base.w, base.h) };
    api.commit({ type: "ADD_STATION", station });
    selectAndInspect(station.id);
    toast(`Added ${nk.label}`);
  }, [api, model, library.entries, subflows.subflows, selectAndInspect, toast]);

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
          overlay={overlay}
          utilById={Object.fromEntries(rating.balance.steps.map((s) => [s.id, s.util]))}
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
          onWire={(from, to) => {
            if (model.flows.some((f) => f.from === from && f.to === to)) { toast("Those steps are already connected", "warn"); return; }
            api.commit({ type: "ADD_FLOW", from, to });
            toast(`Connected ${from} → ${to}`);
          }}
          onDropNode={dropElement}
          onAddNoGo={(z) => { api.commit({ type: "ADD_NOGO", zone: z }); toast("No-go zone added"); }}
          onGroupRect={(z) => {
            // Movable process stations whose centre falls inside the rubber-band.
            const inside = model.stations.filter(
              (s) => s.role === "process" && s.x + s.w / 2 >= z.x && s.x + s.w / 2 <= z.x + z.w && s.y + s.h / 2 >= z.y && s.y + s.h / 2 <= z.y + z.h,
            );
            setMode("select");
            if (inside.length < 2) { toast("Draw around at least two steps to group them", "warn"); return; }
            const name = window.prompt(`Name this grouped element (${inside.length} steps)`, `Group of ${inside.length}`);
            if (name == null) return;
            const sf = makeSubflow(model, inside.map((s) => s.id), name);
            if (sf) { subflows.add(sf); toast(`Grouped ${inside.length} steps as “${sf.name}”`); }
          }}
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
              : mode === "group"
              ? "Group mode: drag a rectangle around the steps to save as a reusable grouped element. Esc to exit."
              : proposal && !proposalDismissed
                ? "Drag movable stations · scroll to zoom · click an amber dashed ghost to accept that move · tap to configure"
                : "Drag movable stations · scroll to zoom · tap to configure"}
        </div>
      </div>
    );
  } else if (view === "improved") {
    const applyImproved = () => {
      if (improved.strategy === "form" && improved.form) {
        api.commit({ type: "APPLY_TEMPLATE", form: improved.form });
        toast(`Applied ${improved.form}-form layout`);
      } else if (proposal) {
        api.commit({ type: "ACCEPT_PROPOSAL", items: proposal.items, itemIds: proposal.items.map((i) => i.stationId) });
        toast(`${proposal.items.length} move${proposal.items.length === 1 ? "" : "s"} accepted`);
      }
      setView("actual");
    };
    canvasInner = (
      <div>
        <LayoutCanvas model={improvedModel} stations={improvedModel.stations} flows={model.flows} chain={api.chain} selId={selId} label="IMPROVED" badge={AMBER} cell={CELL} onSelect={selectAndInspect} />
        <div className="improved-summary">
          {improved.better ? (
            <>
              <div className="improved-metrics">
                <span className="improved-metric" style={{ color: TEAL }}>
                  {improved.deltas.flowCostPct.toFixed(0)}% flow cost
                </span>
                <span className="improved-metric" style={{ color: improved.deltas.travelPct < 0 ? TEAL : TEXTD }}>
                  {improved.deltas.travelPct.toFixed(0)}% travel
                </span>
                <span className="improved-metric" style={{ color: TEXTD }}>
                  {improved.strategy === "form" ? `${improved.form}-form` : `${improved.deltas.moved} moved`}
                </span>
              </div>
              <p className="improved-rationale">{improved.rationale}</p>
              <Button size="sm" kind="primary" onClick={applyImproved}>
                Apply this layout
              </Button>
              <span className="improved-note">Non-destructive — you can undo (Ctrl/Cmd+Z).</span>
            </>
          ) : (
            <p className="improved-rationale">{improved.rationale}</p>
          )}
        </div>
      </div>
    );
  } else if (view === "dag") {
    canvasInner = <DagView model={model} chain={api.chain} selId={selId} onSelect={selectAndInspect} criticalPath={rating.balance.criticalPath} />;
  } else if (view === "split") {
    canvasInner = (
      <div className="splitWrap">
        <LayoutCanvas model={model} stations={model.stations} flows={model.flows} chain={api.chain} selId={selId} label="ACTUAL" badge={TEAL} cell={CELL - 4} onSelect={setSel} />
        <LayoutCanvas model={improvedModel} stations={improvedModel.stations} flows={model.flows} chain={api.chain} selId={selId} label="IMPROVED" badge={AMBER} cell={CELL - 4} onSelect={setSel} />
      </div>
    );
  } else {
    // Analysis — the dedicated home for every derived figure, so the editor
    // rail can stay inputs-only.
    canvasInner = (
      <div className="analysis-view">
        <div className="subtabs" style={{ maxWidth: 760, margin: "0 auto", padding: 0 }}>
          {ANALYSIS_TABS.map((t) => (
            <button key={t.tab} className={"chip" + (analysisTab === t.tab ? " on" : "")} onClick={() => setAnalysisTab(t.tab)}>
              {t.label}
            </button>
          ))}
        </div>
        {analysisTab === "rating" ? (
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <AnalysisDashboard {...analysisPanelProps} />
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            {analysisTab === "balance" && <BalancePanel {...analysisPanelProps} />}
            {analysisTab === "datasheet" && <DataSheetPanel {...analysisPanelProps} />}
            {analysisTab === "capacity" && <CapacityPanel {...analysisPanelProps} />}
            {analysisTab === "cost" && <CostPanel {...analysisPanelProps} />}
            {analysisTab === "auto" && <AutomationPanel {...analysisPanelProps} />}
          </div>
        )}
      </div>
    );
  }

  // Dedicated pages (hash routes). They render full-screen with their own back
  // navigation; all hooks above have already run, so these early returns are safe.
  if (route === "/workspace") return <div className="wrap"><WorkspacePage api={api} onGuided={startGuided} /></div>;
  if (route === "/library") return <div className="wrap"><LibraryPage api={api} subflows={subflows} library={library} /></div>;
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
        {/* The workspace is deliberately NOT reachable from the editor — it is the
            app's entry point, not a detour inside the flow editor. */}
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
      <main className="editor-main">
        {/* Node-RED layout: left library rail · full-bleed canvas · right inputs
            rail. The library carries every draggable (nodes, forms, zones,
            catalog entries, grouped subflows). Hidden in the full-width Analysis
            view. Workspace/folders are a global surface, never reachable here. */}
        {view === "analysis" ? null : (
          <LibrarySidebar
            library={library}
            subflows={subflows}
            onApplyForm={(form) => { api.commit({ type: "APPLY_TEMPLATE", form }); toast(`Arranged as ${form}-form`); }}
            collapsed={libCollapsed}
            setCollapsed={setLibCollapsed}
            width={libWidth}
            setWidth={setLibWidth}
          />
        )}
        <div className="canvas" style={{ position: "relative" }}>
          <div className="viewbar">
            <div className="views">
              {vBtn("actual", "● Actual")}
              {vBtn("improved", "◇ Improved")}
              {vBtn("split", "⇄ Both")}
              {vBtn("dag", "⊟ DAG")}
              {vBtn("analysis", "📊 Analysis")}
            </div>
            {view === "actual" ? (
              <div className="views" style={{ marginLeft: "auto" }} role="group" aria-label="Canvas overlays">
                <button
                  className={"btn sm" + (mode === "group" ? " on" : "")}
                  title="Group mode: drag a rectangle around steps to save them as a reusable grouped element"
                  onClick={() => setMode((m) => (m === "group" ? "select" : "group"))}
                >
                  ⧉ Group
                </button>
                <span className="hsep" />
                <span style={{ fontSize: 11, color: TEXTD, alignSelf: "center", marginRight: 6 }}>overlay</span>
                <button className={"btn sm" + (overlay === "confidence" ? " on" : "")} title="Shade steps whose numbers are estimated" onClick={() => setOverlay((o) => (o === "confidence" ? "none" : "confidence"))}>
                  Confidence
                </button>
                <button className={"btn sm" + (overlay === "congestion" ? " on" : "")} title="Heat by per-step utilization; the bottleneck reads hottest" onClick={() => setOverlay((o) => (o === "congestion" ? "none" : "congestion"))}>
                  Congestion
                </button>
              </div>
            ) : null}
          </div>
          {canvasInner}
          {view === "analysis" ? null : (
            <div className="legend">
              <span>
                role outline: <span style={{ color: TEAL }}>▢</span>input <span style={{ color: AMBER }}>▢</span>output
              </span>
              <span>dots: ergo (TL) · automation (TR)</span>
              <span>
                links: <span style={{ color: TEAL }}>━</span>chained <span style={{ color: "#d96b5b" }}>┅</span>auto-island <span style={{ color: AMBER }}>┅</span>mixed
              </span>
            </div>
          )}
        </div>
        {/* Inputs rail — configuration of steps and connections only. Hidden in
            the Analysis view, which is full-width. */}
        {view === "analysis" ? null : configCollapsed ? (
          <div className="side collapsed">
            <div className="rail">
              <button className="btn sm rail-btn" onClick={() => setConfigCollapsed(false)} title="Show inputs panel">
                ⚙ Inputs
              </button>
            </div>
          </div>
        ) : (
          <>
          <Resizer edge="left" width={configWidth} setWidth={setConfigWidth} min={280} max={760} />
          <div className="side" style={{ flexBasis: configWidth, width: configWidth }}>
          <div className="tabbar">
            <div className="subtabs">
              {INPUT_TABS.map((t) => (
                <button key={t.tab} className={"chip" + (tab === t.tab ? " on" : "")} onClick={() => setTab(t.tab)}>
                  {t.label}
                </button>
              ))}
              <button className={"chip" + (tab === "doc" ? " on" : "")} title="Documentation — every field of the selected step" onClick={() => setTab("doc")}>
                Docs
              </button>
              <button className={"chip" + (tab === "schema" ? " on" : "")} title="Data model / schema reference" onClick={() => setTab("schema")}>
                ?
              </button>
              <button className="chip" title="Collapse inputs panel" onClick={() => setConfigCollapsed(true)}>
                ▶
              </button>
            </div>
          </div>
          {tab === "workload" && <WorkloadPanel {...panelProps} />}
          {tab === "flow" && <FlowPanel {...panelProps} />}
          {tab === "inspect" && <ConfigurePanel {...panelProps} />}
          {tab === "doc" && (
            <div className="pad">
              {(() => {
                const s = model.stations.find((x) => x.id === selId);
                return s ? <StationDoc station={s} /> : <div style={{ color: TEXTD, fontSize: 12 }}>Select a step on the canvas to read its full data sheet.</div>;
              })()}
            </div>
          )}
          {tab === "schema" && <SchemaPanel />}
          {(tab === "rating" || tab === "balance" || tab === "auto" || tab === "cost") && (
            <div className="pad" style={{ color: TEXTD, fontSize: 12 }}>
              Analysis moved to the <button className="chip on" style={{ display: "inline" }} onClick={() => setView("analysis")}>📊 Analysis</button> view.
            </div>
          )}
          </div>
          </>
        )}
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
          // Leaving Concepts creates a new workspace Concept from the chosen
          // candidate (its first layout), so the guided flow yields a concept.
          if (step === "concepts" && picked && loadedCandidate.current !== picked.id) {
            api.createConcept(picked.model.name, null, picked.model);
            loadedCandidate.current = picked.id;
            setSel(null);
            setView("actual");
            setTab("inspect");
            toast(`Created concept ${picked.conceptLabel} (${picked.form}-form).`);
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
    <ProcessShell step={step} reached={reached} onGoto={goTo} fullBleed={step === "refine"}>
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
