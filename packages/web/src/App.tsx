import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFlowPlan } from "./store/useFlowPlan";
import { blankModel } from "@flowplan/core/model/sample";
import { parseModelText } from "@flowplan/core/io/json";
import { downloadJSON } from "./io/download";
import { downloadKpiCsv } from "./io/csv";
import { downloadLayoutPNG } from "./io/image";
import { cloneStation, makeStation } from "@flowplan/core/store/reducer";
import type { Station } from "@flowplan/core/model/types";
import { loadSettings, type Settings } from "./store/settings";
import { LayoutCanvas, type CanvasMode } from "./components/LayoutCanvas";

import { AppFrame, ProcessShell } from "./planner/ProcessShell";
import { StartScreen, DemandStep, ConceptsStep, SummaryStep, type DemandValues } from "./planner/steps";
import { FLOW_STEPS, reachedThrough, widen, type FlowStep } from "./planner/flow";
import { DEFAULT_PROGRAM_YEARS, generateCandidates, rankByDecision, type GenerateBrief } from "@flowplan/core/engine/generate";
import { derivePortfolio } from "@flowplan/core/engine/portfolio";
import { FORM_LABELS } from "@flowplan/core/engine/templates";
import { Btn, IconBtn, TabBtn } from "./components/Btn";
import { Add, ChartLine, Close, Folders, Help, Idea, Redo, Settings as SettingsIcon, SidePanelClose, Undo } from "@carbon/icons-react";
import { Loading } from "@carbon/react";
import { HeaderKpis } from "./components/HeaderKpis";
import { SettingsModal } from "./components/SettingsModal";
import { FlowEditorPopover } from "./components/FlowEditorPopover";
import { Explorer } from "./components/Explorer";
import { Resizer } from "./components/Resizer";
import { useLibrary } from "./store/library";
import { useConcepts } from "./store/concepts";
import { useDecisionWeights } from "./store/decisionWeights";
import { stationFromProcess, type LibraryProcess } from "@flowplan/core/model/library";
// The dedicated pages are behind hash routes and none is part of first paint —
// the app opens on the portal or the editor. Loading them on demand keeps the
// heaviest views (the report, the AI assistant, the charted comparisons) out
// of the initial bundle; a route that is never visited is never downloaded.
const LibraryPage = lazy(() => import("./pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const ConceptsPage = lazy(() => import("./pages/ConceptsPage").then((m) => ({ default: m.ConceptsPage })));
const PlansPage = lazy(() => import("./pages/PlansPage").then((m) => ({ default: m.PlansPage })));
const RecommendPage = lazy(() => import("./pages/RecommendPage").then((m) => ({ default: m.RecommendPage })));
const AnalysisPage = lazy(() => import("./pages/AnalysisPage").then((m) => ({ default: m.AnalysisPage })));
const AssistantPage = lazy(() => import("./pages/AssistantPage").then((m) => ({ default: m.AssistantPage })));
const ComparePage = lazy(() => import("./pages/ComparePage").then((m) => ({ default: m.ComparePage })));
const ReportPage = lazy(() => import("./pages/ReportPage").then((m) => ({ default: m.ReportPage })));
const SitePage = lazy(() => import("./pages/SitePage").then((m) => ({ default: m.SitePage })));
const ArchivePage = lazy(() => import("./pages/ArchivePage").then((m) => ({ default: m.ArchivePage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
import { useHashRoute, navigate } from "./store/useHashRoute";
import { ScenarioControls } from "./components/ScenarioBar";
import { StationTooltip } from "./components/StationTooltip";
import { ProposalPanel } from "./components/ProposalPanel";
import { makePlacementProposal } from "@flowplan/core/engine/proposal";
import { DagView } from "./components/DagView";
import { Menu } from "./components/Menu";
import { useToast } from "./components/ui";
import {
  AddStepButtons,
  ConfigurePanel,
  FlowPanel,
  SchemaPanel,
  type PanelProps,
  type Tab,
} from "./components/panels";
import { SectionLabel } from "./components/analysisKit";
import { InlineNotification } from "@carbon/react";
import { useT } from "./i18n";
import { useAccents } from "./components/colors";

type View = "actual" | "improved" | "split" | "dag";
const CELL = 30;

// A blank planning brief — one empty part row so the required table is never an
// empty frame. Used for first paint and for starting a genuinely new plan.
function blankDemand(): DemandValues {
  return {
    name: "New product",
    programYears: DEFAULT_PROGRAM_YEARS,
    annualShifts: 460,
    shiftHours: 8,
    parts: [{ id: "part-1", partNumber: "PN-001", steps: [], demandByYear: [] }],
  };
}

// The editor rail edits the thing on the canvas: the flow between steps, and
// the step you have selected. Nothing else.
//
// It used to carry the whole assessment as well — six analysis stages with
// their own jump-nav, inside 360px, beside a Workload tab and an AI Chat tab.
// Five things competing in a column too narrow for any of them, and the same
// assessment already existed on the Summary step and in the report. Analysis
// and the assistant are full-width pages now; the rail is two tabs.
const RAIL_TABS: { tab: Tab; label: string }[] = [
  { tab: "flow", label: "Flow" },
  { tab: "inspect", label: "Element" },
];

export function App() {
  const api = useFlowPlan();
  const { toast } = useToast();
  const t = useT();
  const { TEAL, AMBER, RED } = useAccents();
  const [view, setView] = useState<View>("actual");
  const [tab, setTab] = useState<Tab>("flow");
  const [selId, setSel] = useState<string | null>(null);
  // A polite live region: keyboard/screen-reader users get told what a station
  // did (selected, moved, deleted) since the canvas itself is visual.
  const [announce, setAnnounce] = useState("");
  const [mode, setMode] = useState<CanvasMode>("select");
  const [flowFirst, setFlowFirst] = useState<string | null>(null);
  const [selFlow, setSelFlow] = useState<{ from: string; to: string } | null>(null);
  const [hover, setHover] = useState<{ station: Station; x: number; y: number } | null>(null);
  const [proposalDismissed, setProposalDismissed] = useState(false);
  // Persisted across reloads. Once you have entered the app — opened a cell,
  // planned one, imported one — a refresh returns you to it rather than to the
  // front door. The old gate keyed off `flowplan_model`, a legacy autosave key
  // nothing has written since the workspace replaced it, so it read false on
  // every reload and bounced the planner back to the portal.
  const resumed = localStorage.getItem("flowplan_started") === "1";
  // The start screen sits outside the stepper: until you have chosen to plan
  // something or to open something, there is no stage to be on.
  const [started, setStarted] = useState(resumed);
  const [step, setStep] = useState<FlowStep>(resumed ? "refine" : FLOW_STEPS[0]);
  const [reached, setReached] = useState<FlowStep[]>(resumed ? FLOW_STEPS.slice() : [FLOW_STEPS[0]]);
  const goTo = useCallback((s: FlowStep) => {
    setStarted(true);
    setStep(s);
    setReached((r) => widen(r, reachedThrough(s)));
  }, []);
  // ---- planning brief (lifted out of the planner so the stepper owns it) ----
  const [demand, setDemand] = useState<DemandValues>(blankDemand);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Which candidate has already been loaded into the workspace, so advancing
  // to Refine twice does not create duplicate cells.
  const loadedCandidate = useRef<string | null>(null);
  // Planning a cell is a NEW plan every time: reset the parts matrix and any
  // concept already chosen so nothing from the last session is carried in, then
  // enter the flow at its first stage. The saved cells (the plans store) are
  // untouched — this starts a fresh brief, it does not delete anything.
  const startNewPlan = useCallback(() => {
    setDemand(blankDemand());
    setPickedId(null);
    loadedCandidate.current = null;
    goTo("demand");
    // Also leave any route page (the plans store opens this too), so the fresh
    // brief actually shows instead of the page it was launched from.
    navigate("/");
  }, [goTo]);
  // The FlowPlan wordmark returns to the portal: leave the editor/wizard (the
  // saved cells are untouched) and any route page. It does not delete anything.
  const goHome = useCallback(() => {
    setStarted(false);
    navigate("/");
  }, []);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [route] = useHashRoute();
  // Collapsible in-layout sidebars (persisted). Left = workspace Explorer, right = config panel.
  // Shut unless the planner left it open. It overlays the canvas now, so a
  // drawer that opens itself on arrival is a drawer in the way.
  const [explorerCollapsed, setExplorerCollapsed] = useState(() => localStorage.getItem("flowplan_explorer_collapsed") !== "0");
  const [configCollapsed, setConfigCollapsed] = useState(() => localStorage.getItem("flowplan_config_collapsed") === "1");
  useEffect(() => { localStorage.setItem("flowplan_explorer_collapsed", explorerCollapsed ? "1" : "0"); }, [explorerCollapsed]);
  useEffect(() => { localStorage.setItem("flowplan_config_collapsed", configCollapsed ? "1" : "0"); }, [configCollapsed]);
  // Remember that the app has been entered, so a reload resumes the editor
  // rather than the portal; Back to the portal forgets it again.
  useEffect(() => { localStorage.setItem("flowplan_started", started ? "1" : "0"); }, [started]);
  // Drag-resizable sidebar widths (persisted).
  const numOr = (k: string, d: number) => { const n = Number(localStorage.getItem(k)); return Number.isFinite(n) && n > 0 ? n : d; };
  const [explorerWidth, setExplorerWidth] = useState(() => numOr("flowplan_explorer_w", 320));
  const [configWidth, setConfigWidth] = useState(() => numOr("flowplan_config_w", 360));
  useEffect(() => { localStorage.setItem("flowplan_explorer_w", String(explorerWidth)); }, [explorerWidth]);
  useEffect(() => { localStorage.setItem("flowplan_config_w", String(configWidth)); }, [configWidth]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const clipboard = useRef<Station | null>(null);
  // The process library — what this plant knows how to do. Outlives any one
  // cell, so it is persisted separately from the workspace.
  const lib = useLibrary();
  // The concept catalog the sweep ranks against — the planner's, if they have
  // edited it, rather than the archetypes the app ships with.
  const conceptApi = useConcepts();
  // What "best" means when ranking concepts. The order used to be loaded cost
  // per part and nothing else, stated nowhere.
  const weightsApi = useDecisionWeights();

  const { model, rating } = api;

  const selectAndInspect = useCallback((id: string | null) => {
    setSel(id);
    if (id) setTab("inspect");
  }, []);

  // Place a library process on the canvas, carrying its numbers. "Add process
  // step" used to hand back a blank "New Step" at 30s every time.
  const addProcessStep = useCallback(
    (p: LibraryProcess) => {
      const st = stationFromProcess(api.model, p);
      api.commit({ type: "ADD_STATION", station: st });
      setSel(st.id);
      setTab("inspect");
      toast(`Added ${p.name} (${p.cycleTimeSec}s)`);
    },
    [api, toast],
  );

  // ---- derived planning data ----------------------------------------------
  // The parts are the brief. Everything the generator needs comes out of them:
  // the cell is sized against the busiest year rather than an averaged annual
  // figure, capex is amortised over every part and every year, and the routing
  // and mix modes are derived rather than typed. Null until a part carries both
  // a routing and demand — which is what the Continue button waits for.
  const portfolio = useMemo(() => derivePortfolio(demand.parts), [demand.parts]);
  const brief: GenerateBrief = {
    ...demand,
    steps: portfolio ? portfolio.steps : [],
    annualVolume: portfolio ? portfolio.peakVolume : 0,
    // programYears is only ever used as `annualVolume x programYears` to
    // amortise capex, so the real program volume goes in as an equivalent.
    programYears:
      portfolio && portfolio.peakVolume > 0 ? portfolio.programVolume / portfolio.peakVolume : demand.programYears,
    variantModes: portfolio ? portfolio.modes : undefined,
    conceptCatalog: conceptApi.concepts,
  };
  // What the brief was actually sized against: the portfolio's peak year.
  const perShift = portfolio && demand.annualShifts > 0 ? portfolio.peakVolume / demand.annualShifts : 0;

  const candidates = useMemo(
    // The report records which concepts were compared, so it needs them
    // regenerated even when the stepper has moved on to Refine.
    () =>
      step === "concepts" || step === "summary" || route === "/report"
        ? rankByDecision(generateCandidates(brief), weightsApi.weights)
        : [],
    [step, route, demand, conceptApi.concepts, weightsApi.weights],
  );
  const picked = candidates.find((c) => c.id === pickedId) ?? candidates[0] ?? null;

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
          // Import lands as its own plan in the store, so it works from an empty
          // workspace and never overwrites a plan you have open.
          api.addCell(res.model, res.model.name);
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
      // An open dialog or dropdown menu owns the keyboard: Escape closes it,
      // Delete edits its fields. Without this, those keys also reached the
      // canvas behind it — Escape cleared the selection, Delete removed a
      // station the planner could not even see.
      if (document.querySelector(".cds--modal.is-visible, .menu-pop")) return;
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
        // The settings dialog closes itself on Escape now (Carbon Modal), and
        // the guard above means we only get here with no dialog open.
        setMode("select");
        setFlowFirst(null);
        setSel(null);
        setSelFlow(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selId) {
        e.preventDefault();
        const gone = model.stations.find((x) => x.id === selId);
        api.commit({ type: "DELETE_STATION", id: selId });
        setSel(null);
        setAnnounce(`Deleted ${gone?.name ?? "station"}. Press Ctrl+Z to undo.`);
        return;
      }
      if (e.key === "1") setView("actual");
      if (e.key === "2") setView("improved");
      if (e.key === "3") setView("split");
      if (e.key === "4") setView("dag");
      const s = model.stations.find((x) => x.id === selId);
      if (s && e.key.startsWith("Arrow")) {
        e.preventDefault();
        if (s.fixed) {
          setAnnounce(`${s.name} is fixed in place and cannot be moved.`);
          return;
        }
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        api.commit({ type: "MOVE_STATION", id: s.id, x: s.x + dx, y: s.y + dy });
        setAnnounce(`${s.name} moved to column ${s.x + dx + 1}, row ${s.y + dy + 1}.`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api, selId, model.stations]);

  // Announce the newly-selected station so a keyboard/screen-reader user knows
  // what has focus and how to act on it. Keyed on the selection only, so a move
  // (announced by the handler above) does not double-announce.
  useEffect(() => {
    if (!selId) return;
    const s = model.stations.find((x) => x.id === selId);
    if (s) {
      setAnnounce(
        `Selected ${s.name}, column ${s.x + 1}, row ${s.y + 1}. ` +
          (s.fixed ? "Fixed in place." : "Use the arrow keys to move it, Delete to remove it."),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announce on selection change only
  }, [selId]);

  const panelProps: PanelProps = { api, selId, setSel, setTab, setView, mode, setMode, lib, onAddProcess: addProcessStep };

  function vBtn(k: View, l: string) {
    return (
      <TabBtn selected={view === k} onClick={() => setView(k)}>
        {l}
      </TabBtn>
    );
  }
  const improvedModel = { ...model, stations: rating.optimized };

  // An empty layout is an empty grey rectangle, and the only way to add a step
  // is a button buried in the Flow tab. Put the first action on the canvas the
  // user is looking at.
  const emptyCanvas =
    model.stations.length === 0 ? (
      <div className="canvas-empty">
        <p className="canvas-empty__title">This cell is empty</p>
        <p className="canvas-empty__body">
          Add process steps to lay them out, connect them and see the rating, balance and cost fill in.
        </p>
        <Btn
          variant="primary"
          size="compact"
          icon={Add}
          onClick={() => {
            const ns = makeStation(model);
            api.commit({ type: "ADD_STATION", station: ns });
            setSel(ns.id);
            setTab("inspect");
          }}
        >
          Add the first process step
        </Btn>
      </div>
    ) : null;

  // §4: the optimizer's output is a proposal, not a write. Recomputed with the
  // rating; dismissal is cleared whenever a genuinely new one appears.
  const proposal = useMemo(() => makePlacementProposal(model, rating), [model, rating]);
  useEffect(() => { setProposalDismissed(false); }, [proposal?.baseSignature]);

  let canvasInner;
  if (view === "actual") {
    canvasInner = (
      <div className="canvas__stage">
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
                ? "Drag movable stations · scroll to zoom · click an amber ghost to accept that move"
                : "Drag movable stations, or Tab to one and move it with the arrow keys · scroll to zoom · click a step to configure it"}
        </div>
      </div>
    );
  } else if (view === "improved") {
    canvasInner = (
      <div className="canvas__stage">
        <LayoutCanvas model={improvedModel} stations={rating.optimized} flows={model.flows} chain={api.chain} selId={selId} label="IMPROVED" badge={AMBER} cell={CELL} onSelect={selectAndInspect} />
        <div className="u-row u-row--wrap">
          <span className="u-caption" style={{ color: TEAL }}>−{rating.flowReductionPct.toFixed(0)}% flow cost vs actual</span>
        </div>
        <div className="u-caption">
          {proposal
            ? `${proposal.items.length} proposed move${proposal.items.length === 1 ? "" : "s"} — switch to Actual to accept them on the canvas.`
            : "Already optimal — no moves to propose."}
        </div>
      </div>
    );
  } else if (view === "dag") {
    canvasInner = (
      <div className="canvas__stage canvas__stage--scroll">
        <DagView model={model} chain={api.chain} selId={selId} onSelect={selectAndInspect} criticalPath={rating.balance.criticalPath} />
      </div>
    );
  } else {
    canvasInner = (
      <div className="canvas__stage splitWrap">
        <LayoutCanvas model={model} stations={model.stations} flows={model.flows} chain={api.chain} selId={selId} label="ACTUAL" badge={TEAL} cell={CELL - 4} onSelect={setSel} />
        <LayoutCanvas model={improvedModel} stations={rating.optimized} flows={model.flows} chain={api.chain} selId={selId} label="IMPROVED" badge={AMBER} cell={CELL - 4} onSelect={setSel} />
      </div>
    );
  }

  // Dedicated pages (hash routes). They render full-screen with their own back
  // navigation; all hooks above have already run, so these early returns are
  // safe. Each page is lazy, so a Suspense boundary covers the moment its chunk
  // loads with a light placeholder.
  const routePage = (node: ReactNode) => (
    <div className="wrap">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <main id="main-content" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="wrap-loading">
              <Loading withOverlay={false} description="Loading" />
            </div>
          }
        >
          {node}
        </Suspense>
      </main>
    </div>
  );
  if (route === "/report")
    return routePage(
      <ReportPage
        api={api}
        // Only a concept that was actually carried into the workspace counts
        // as "taken" — the pre-selected top rank on Concepts does not.
        picked={candidates.find((c) => c.id === loadedCandidate.current) ?? null}
        candidates={candidates}
        demand={demand}
        portfolio={portfolio}
      />,
    );
  if (route === "/analysis") return routePage(<AnalysisPage {...panelProps} />);
  if (route === "/assistant")
    return routePage(<AssistantPage api={api} settings={settings} openSettings={() => setShowSettings(true)} />);
  // The library is a destination in its own right — reachable from the front
  // door, and useful with no cell open at all.
  if (route === "/library") return routePage(<LibraryPage lib={lib} />);
  if (route === "/concepts") return routePage(<ConceptsPage api={conceptApi} />);
  // The store of saved plans, reachable from the front door. Opening one makes
  // it active and drops into the editor; a new plan starts a fresh brief.
  if (route === "/plans")
    return routePage(
      <PlansPage
        api={api}
        onOpen={(id) => {
          api.switchCell(id);
          goTo("refine");
          navigate("/");
        }}
        onNew={startNewPlan}
      />,
    );
  // Concepts for the cell that is actually open, rather than only on the way
  // past in the planning flow.
  if (route === "/recommend")
    return routePage(<RecommendPage api={api} concepts={conceptApi.concepts} weightsApi={weightsApi} />);
  if (route === "/compare") return routePage(<ComparePage api={api} />);
  if (route === "/site") return routePage(<SitePage api={api} />);
  if (route === "/archive") return routePage(<ArchivePage api={api} />);
  if (route === "/admin") return routePage(<AdminPage />);
  // A link that matches no page — show it as one, rather than dropping the
  // planner onto whatever cell happens to be open.
  if (route === "/404")
    return (
      <div className="wrap">
        <div className="page">
          <h1 className="page-title">{t("editor.notFound.title")}</h1>
          <p className="u-muted">{t("editor.notFound.body")}</p>
          <Btn variant="primary" size="compact" onClick={() => navigate("/")}>
            {t("editor.notFound.back")}
          </Btn>
        </div>
      </div>
    );

  const cellName = api.cells.find((c) => c.id === api.activeId)?.name ?? t("editor.drawer.title");

  const editorToolbar = (
    <div className="editorbar">
      <HeaderKpis api={api} />
      <div className="spacer" />
      {/* One primary per view: leaving the editor is it. */}
      <Btn variant="primary" size="compact" onClick={() => goTo("summary")}>
        {t("editor.continueToSummary")}
      </Btn>
      <span className="hsep" />
      <Btn
        size="compact"
        variant="ghost"
        pressed={!explorerCollapsed}
        icon={Folders}
        className="editorbar__cell"
        title={cellName}
        onClick={() => setExplorerCollapsed((v) => !v)}
      >
        {cellName.length > 22 ? cellName.slice(0, 21).trimEnd() + "…" : cellName}
      </Btn>
      <span className="hsep" />
      {/* Analysis and the assistant left the rail; they are reachable here. */}
      <Btn size="compact" icon={ChartLine} onClick={() => navigate("/analysis")} title="The full assessment">
        {t("editor.analysis")}
      </Btn>
      {/* Not "Concepts" — the stepper already has a stage by that name, and
          this is the verb, not the stage. */}
      <Btn size="compact" icon={Idea} onClick={() => navigate("/recommend")} title="Concepts for this cell's work content">
        {t("editor.recommend")}
      </Btn>
      <span className="hsep" />
      <ScenarioControls api={api} onCompare={() => navigate("/compare")} />
      <span className="hsep" />
      <IconBtn size="compact" icon={Undo} label={t("editor.undo")} disabled={!api.canUndo} onClick={api.undo} />
      <IconBtn size="compact" icon={Redo} label={t("editor.redo")} disabled={!api.canRedo} onClick={api.redo} />
      <span className="hsep" />
      <input ref={fileRef} type="file" accept=".json,application/json" onChange={importFile} style={{ display: "none" }} />
        <Menu
          label={t("editor.export")}
          title={t("editor.export.title")}
          items={[
            { label: t("editor.export.loadJson"), onClick: () => fileRef.current?.click() },
            { label: t("editor.export.exportJson"), onClick: () => downloadJSON(model) },
            { label: t("editor.export.exportCsv"), onClick: () => downloadKpiCsv(model) },
            {
              label: t("editor.export.exportPng"),
              onClick: async () => {
                const ok = await downloadLayoutPNG("ACTUAL", (model.name || "layout").replace(/\s+/g, "_"));
                if (!ok) toast(t("editor.export.pngWarn"), "warn");
              },
            },
            // The report is a page in the app now, not a hand-written HTML
            // popup — same content, but themed, printable and linkable.
            { label: t("editor.export.openReport"), onClick: () => navigate("/report") },
          ]}
        />
        <IconBtn size="compact" icon={SettingsIcon} label={t("editor.settings")} onClick={() => setShowSettings(true)} />
    </div>
  );

  const editorBody = (
      <main>
        {/* Canvas actions are visual; this narrates them for assistive tech. */}
        <p className="cds--visually-hidden" role="status" aria-live="polite">{announce}</p>
        {/* An overlay, not a column. Closed, it takes no width at all — the
            collapsed state used to leave a vertical rail strip still standing
            beside the canvas. */}
        {explorerCollapsed ? null : (
          <aside className="explorer-side" style={{ width: explorerWidth }}>
            {/* A header bar, matching the right config panel's tab bar and the
                app's top bars, rather than a title floating in the padding. */}
            <div className="explorer-head">
              <h2 className="explorer-title">{t("editor.drawer.title")}</h2>
              <IconBtn size="compact" icon={Close} label={t("editor.drawer.close")} tooltipPosition="left" onClick={() => setExplorerCollapsed(true)} />
            </div>
            <div className="explorer">
              <Explorer api={api} />
            </div>
            {/* Add process steps to the open cell straight from the left, next
                to the plans tree, as well as from the Flow rail. */}
            <div className="explorer-foot">
              <SectionLabel>{t("editor.drawer.addStep")}</SectionLabel>
              <AddStepButtons api={api} setSel={setSel} setTab={setTab} lib={lib} onAddProcess={addProcessStep} />
            </div>
            {/* Inside the drawer, riding its right edge — as a flex sibling it
                would sit at x=0 now that the drawer floats over the canvas. */}
            <Resizer edge="right" width={explorerWidth} setWidth={setExplorerWidth} />
          </aside>
        )}
        <div className="canvas" style={{ position: "relative" }}>
          <div className="viewbar">
            <div className="views" role="tablist" aria-label="Layout view">
              {vBtn("actual", t("editor.view.actual"))}
              {vBtn("improved", t("editor.view.improved"))}
              {vBtn("split", t("editor.view.both"))}
              {vBtn("dag", t("editor.view.dag"))}
            </div>
          </div>
          {/* A manually-added step isn't in the part flow until something routes
              into it. Say so, and how to fix it, rather than leaving it a silent
              orphan the balance quietly ignores. */}
          {(() => {
            const orphans = model.stations.filter((s) => s.role === "process" && !model.flows.some((f) => f.to === s.id));
            if (orphans.length === 0) return null;
            return (
              <div className="canvas-banner">
                <InlineNotification
                  kind="info"
                  lowContrast
                  hideCloseButton
                  title={orphans.length === 1 ? t("editor.orphan.one", { name: orphans[0].name }) : t("editor.orphan.many", { n: orphans.length })}
                  subtitle={t("editor.orphan.help")}
                />
              </div>
            );
          })()}
          {canvasInner}
          {emptyCanvas}
          <div className="legend">
            <span>
              {t("editor.legend.roleOutline")} <span style={{ color: TEAL }}>▢</span>{t("editor.legend.input")} <span style={{ color: AMBER }}>▢</span>{t("editor.legend.output")}
            </span>
            <span>{t("editor.legend.dots")}</span>
            <span>
              {t("editor.legend.links")} <span style={{ color: TEAL }}>━</span>{t("editor.legend.chained")} <span style={{ color: RED }}>┅</span>{t("editor.legend.autoIsland")} <span style={{ color: AMBER }}>┅</span>{t("editor.legend.mixed")}
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
              <Btn size="compact" variant="ghost" className="rail-btn" onClick={() => setConfigCollapsed(false)}>
                {t("editor.config")}
              </Btn>
            </div>
          ) : (
          <>
          <div className="tabbar">
            <div className="grouptabs">
              {/* Only the tabs live in the tablist (aria-required-children); the
                  icon controls beside them are buttons, not tabs. display:contents
                  keeps the flex row visually intact. */}
              <div className="grouptabs__tabs" role="tablist" aria-label="Editor panel">
                {RAIL_TABS.map((t) => (
                  <TabBtn key={t.tab} selected={tab === t.tab} onClick={() => setTab(t.tab)}>
                    {t.label}
                  </TabBtn>
                ))}
              </div>
              <IconBtn
                size="compact"
                icon={Help}
                label="Data model reference"
                tooltipPosition="left"
                selected={tab === "schema"}
                className="help-tab"
                onClick={() => setTab("schema")}
              />
              <IconBtn
                size="compact"
                icon={SidePanelClose}
                label="Collapse config panel"
                tooltipPosition="left"
                className="help-tab"
                onClick={() => setConfigCollapsed(true)}
              />
            </div>
          </div>
          {/* The active tab controls this panel — name it so a tab is not left
              pointing at unlabelled content. */}
          <div role="tabpanel" aria-label={RAIL_TABS.find((t) => t.tab === tab)?.label ?? tab} className="tabpanel">
            {tab === "flow" && <FlowPanel {...panelProps} />}
            {tab === "inspect" && <ConfigurePanel {...panelProps} />}
            {tab === "schema" && <SchemaPanel />}
          </div>
          </>
          )}
        </div>
      </main>
  );

  const stepNav = (
    <div className="planner__actions">
      {/* Back off the first stage returns to the start screen rather than being
          a dead button — leaving the flow is the only thing "before" it. */}
      <Btn
        variant="secondary"
        onClick={() =>
          step === FLOW_STEPS[0] ? setStarted(false) : goTo(FLOW_STEPS[FLOW_STEPS.indexOf(step) - 1])
        }
      >
        Back
      </Btn>
      {step === "summary" ? null : (
      <Btn
        variant="primary"
        onClick={() => {
          // Leaving Concepts loads the chosen candidate, so Refine edits the
          // generated cell rather than whatever was open before.
          if (step === "concepts" && picked && loadedCandidate.current !== picked.id) {
            api.addCell(picked.model, picked.model.name);
            loadedCandidate.current = picked.id;
            setSel(null);
            setView("actual");
            // "analysis" stopped being a rail tab when the assessment moved to
            // its own page; leaving it selected here left the rail rendering
            // nothing at all — Flow and Element present, neither chosen.
            setTab("flow");
            toast(`Loaded ${picked.conceptLabel} (${FORM_LABELS[picked.form]}).`);
          }
          goTo(FLOW_STEPS[Math.min(FLOW_STEPS.length - 1, FLOW_STEPS.indexOf(step) + 1)]);
        }}
        disabled={
          // The parts are the precondition, not an optional refinement: without
          // at least one carrying a routing and a demand there is nothing to
          // size a concept against.
          (step === "demand" && !portfolio) ||
          (step === "concepts" && !picked)
        }
      >
        {step === "concepts" ? "Refine this layout" : "Continue"}
      </Btn>
      )}
      {step === "summary" ? (
        <Btn variant="primary" onClick={() => goTo("refine")}>
          Back to the editor
        </Btn>
      ) : null}
    </div>
  );

  // Before anything is opened or planned there is no stage to be on, so the
  // start screen renders outside the shell — no stepper, no Back/Continue.
  if (!started) {
    return (
      <AppFrame>
        <StartScreen
          cellCount={api.cells.length}
          processCount={lib.processes.length}
          // Planning a cell is a NEW plan: wipe the parts matrix and any concept
          // already picked, so the flow opens on a blank brief rather than
          // resuming whatever was entered last time.
          onPlan={startNewPlan}
          onLibrary={() => navigate("/library")}
          onConcepts={() => navigate("/concepts")}
          onOpenPlans={() => navigate("/plans")}
          conceptCount={conceptApi.concepts.length}
          conceptsEdited={!conceptApi.isPristine}
          onBlank={() => { api.addCell(blankModel(), "Untitled"); setTab("flow"); goTo("refine"); }}
          onImport={() => fileRef.current?.click()}
        />
        {/* The editor tree's copy of this input is not mounted here. */}
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importFile} />
      </AppFrame>
    );
  }

  return (
    <ProcessShell step={step} reached={reached} onGoto={goTo} fill={step === "refine"} onHome={goHome}>
      {step === "demand" ? (
        <DemandStep values={demand} lib={lib} onChange={(patch) => setDemand((d) => ({ ...d, ...patch }))} />
      ) : null}

      {step === "concepts" ? (
        <ConceptsStep
          candidates={candidates}
          selectedId={picked?.id ?? null}
          onSelect={setPickedId}
          perShift={perShift}
          peakYear={portfolio?.peakYear}
          brief={brief}
          weightsApi={weightsApi}
        />
      ) : null}

      {step === "refine" ? (
        <>
          {editorToolbar}
          {editorBody}
        </>
      ) : null}

      {step === "summary" ? (
        <SummaryStep
          picked={picked}
          api={api}
          // The glance tiles are entry points, not decoration: opening one
          // goes to the Analysis page, scrolled to that stage. It used to
          // select an "analysis" rail tab, which no longer exists.
          onOpenAnalysis={(id) => {
            navigate("/analysis");
            requestAnimationFrame(() => document.getElementById("an-" + id)?.scrollIntoView?.({ block: "start" }));
          }}
        />
      ) : null}

      {step !== "refine" ? stepNav : null}

      {hover ? <StationTooltip station={hover.station} x={hover.x} y={hover.y} shiftHours={model.shiftHours ?? 8} /> : null}

      {showSettings ? (
        <SettingsModal initial={settings} onClose={() => setShowSettings(false)} onSaved={setSettings} />
      ) : null}
      <input ref={fileRef} type="file" accept=".json,application/json" onChange={importFile} style={{ display: "none" }} />
    </ProcessShell>
  );
}
