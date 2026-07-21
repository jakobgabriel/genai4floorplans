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
import { AppHeader, type HeaderSection } from "./components/AppHeader";
import { SituationStep, DemandStep, ProcessStepView, ConceptsStep, SummaryStep, DEFAULT_DEMAND, toDemand, type DemandValues } from "./planner/steps";
import { FLOW_STEPS, reachedThrough, widen, type FlowStep } from "./planner/flow";
import { USE_CASES, type UseCaseId } from "./planner/usecases";
import { generateCandidates, rankCandidates, type GenerateBrief, type ProcessStep as CoreStep } from "@flowplan/core/engine/generate";
import { Button, IconButton, Tab as CarbonTab, TabList, Tabs, Theme } from "@carbon/react";
import { ArrowLeft, ChartColumn, Compare, FlowConnection, GroupObjects, Layers, SidePanelClose, MagicWand } from "@carbon/icons-react";
import { useTheme } from "./store/theme";
import { getPreferences, patchPreferences } from "./store/preferences";
import { HeaderKpis } from "./components/HeaderKpis";
import { SettingsModal } from "./components/SettingsModal";
import { FlowEditorPopover } from "./components/FlowEditorPopover";
import { GroupEditorPopover } from "./components/GroupEditorPopover";
import { Resizer } from "./components/Resizer";
import { LibrarySidebar } from "./components/LibrarySidebar";
import { ComparePage } from "./pages/ComparePage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { LibraryPage } from "./pages/LibraryPage";
import { ArchivePage } from "./pages/ArchivePage";
import { AdminPage } from "./pages/AdminPage";
import { useHashRoute, navigate } from "./store/useHashRoute";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { StationTooltip } from "./components/StationTooltip";
import { ProposalPanel } from "./components/ProposalPanel";
import { WorkloadPanel } from "./components/WorkloadPanel";
import { makePlacementProposal } from "@flowplan/core/engine/proposal";
import { improvedLayout } from "@flowplan/core/engine/improved";
import { costAnalysis } from "@flowplan/core/engine/cost";
import { OptimizeModal } from "./components/OptimizeModal";
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
import { AMBER, RED, TEAL, TEXTD } from "./components/colors";

type View = "actual" | "split" | "dag" | "analysis";
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
  // AI Chat is hidden for now (audit B-03). Before re-enabling it, its apply path
  // must route through the governed placement-Proposal flow (makePlacementProposal
  // → ProposalPanel → ACCEPT_PROPOSAL, with pin-respect and staleness). Today it
  // commits SET_MODEL / live edits directly, which bypasses that governance —
  // exactly the silent-overwrite risk spec §4 calls adoption-fatal.
];
// The editor input rail's tabs (Configure/Flow/Workload) plus the docs + schema
// reference. Every value the `tab` state can hold while the rail is shown is a
// tab, so the Carbon selectedIndex is always resolvable.
const RAIL_TABS: { tab: Tab; label: string; title?: string }[] = [
  ...INPUT_TABS,
  { tab: "doc", label: "Docs", title: "Documentation — every field of the selected step" },
  { tab: "schema", label: "Schema", title: "Data model / schema reference" },
];

export function App() {
  const api = useFlowPlan();
  const { toast } = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const subflows = useSubflows();
  const library = useLibrary();
  const [view, setView] = useState<View>("actual");
  const [tab, setTab] = useState<Tab>("inspect");
  const [analysisTab, setAnalysisTab] = useState<Tab>("rating");
  const [selId, setSel] = useState<string | null>(null);
  const [selZone, setSelZone] = useState<number | null>(null);
  const [selGroup, setSelGroup] = useState<string | null>(null);
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
  // The workspace cell this guided session materialised its concept into. On
  // re-entry (the user went back, changed steps, and came forward again) we
  // update THIS cell in place rather than spawning a duplicate — so an added or
  // removed step is reflected without cluttering the workspace. Cleared whenever
  // a fresh guided session starts, so a new concept never overwrites an old one.
  const guidedCell = useRef<string | null>(null);
  // Signature of what was last materialised, so re-entering Concepts without any
  // change keeps the user's editor edits instead of overwriting them.
  const guidedSig = useRef<string | null>(null);
  // Start the guided wizard for a new concept, from the workspace.
  const startGuided = useCallback(() => {
    // A brand-new concept must not reuse the previous guided session's cell —
    // otherwise the next Concepts→Refine would overwrite the earlier concept's
    // layout instead of creating a fresh one. Clear the session's binding.
    guidedCell.current = null;
    guidedSig.current = null;
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
  const [demand, setDemand] = useState<DemandValues>(DEFAULT_DEMAND);
  const [processSteps, setProcessSteps] = useState<CoreStep[]>([
    { name: "Load blank", cycleTimeSec: 15 },
    { name: "Press", cycleTimeSec: 35 },
    { name: "Weld", cycleTimeSec: 60 },
    { name: "Leak test", cycleTimeSec: 25 },
    { name: "Pack", cycleTimeSec: 20 },
  ]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showOptimize, setShowOptimize] = useState(false);
  const [route] = useHashRoute();
  // Editor panel layout is a user preference (Postgres when signed in, else
  // localStorage): collapse + drag-width of the inputs rail and the library rail.
  const panelPrefs = getPreferences().panels ?? {};
  const numOr = (v: number | undefined, d: number) => (Number.isFinite(v) && (v as number) > 0 ? (v as number) : d);
  const [configCollapsed, setConfigCollapsed] = useState(() => panelPrefs.configCollapsed === true);
  useEffect(() => { patchPreferences({ panels: { configCollapsed } }); }, [configCollapsed]);
  const [configWidth, setConfigWidth] = useState(() => numOr(panelPrefs.configW, 360));
  useEffect(() => { patchPreferences({ panels: { configW: configWidth } }); }, [configWidth]);
  const [libCollapsed, setLibCollapsed] = useState(() => panelPrefs.libCollapsed === true);
  useEffect(() => { patchPreferences({ panels: { libCollapsed } }); }, [libCollapsed]);
  const [libWidth, setLibWidth] = useState(() => numOr(panelPrefs.libW, 260));
  useEffect(() => { patchPreferences({ panels: { libW: libWidth } }); }, [libWidth]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const clipboard = useRef<Station | null>(null);

  const { model, rating } = api;

  // Stations with a layout-realism conflict (clearance / floor load / egress),
  // ringed red on the canvas so an unbuildable placement is visible (audit C-03).
  const realismConflictIds = useMemo(() => {
    const r = api.realism;
    return Array.from(new Set([
      ...r.clearanceConflicts.flat(),
      ...r.overloaded.map((o) => o.id),
      ...r.enclosed,
    ]));
  }, [api.realism]);

  // Selecting a step opens Configure in the editor. Only leave the Analysis view
  // (a deep-link back to the editor); staying in DAG/Improved when selecting a
  // node there is the expected behaviour.
  const selectAndInspect = useCallback((id: string | null) => {
    setSel(id);
    if (id) {
      setSelZone(null);
      setView((v) => (v === "analysis" ? "actual" : v));
      setTab("inspect");
    }
  }, []);

  // ---- derived planning data ----------------------------------------------
  const briefSteps: CoreStep[] = processSteps;

  const brief: GenerateBrief = {
    name: demand.name,
    steps: briefSteps,
    annualVolume: demand.annualVolume,
    annualShifts: demand.annualShifts,
    shiftHours: demand.shiftHours,
    programYears: demand.programYears,
    demand: toDemand(demand),
    variantModes: demand.variantModes.length ? demand.variantModes : undefined,
    defaultTransport: demand.transport,
    defaultPartWeightKg: demand.partWeightKg,
  };
  const perShift = demand.annualShifts > 0 ? demand.annualVolume / demand.annualShifts : 0;

  const candidates = useMemo(
    () => (step === "concepts" || step === "summary" ? rankCandidates(generateCandidates(brief)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, demand, briefSteps],
  );
  const picked = candidates.find((c) => c.id === pickedId) ?? candidates[0] ?? null;
  const useCase = useCaseId ? USE_CASES.find((u) => u.id === useCaseId) ?? null : null;

  // The Summary must reflect what the user actually built in the editor, not the
  // original generated candidate — otherwise refinements never reach the decision
  // one-pager. Recompute the headline metrics from the live workspace model.
  const liveSummary = useMemo(() => {
    if (step !== "summary") return null;
    const m = api.model;
    const r = api.rating;
    const c = costAnalysis(m);
    const programParts = demand.annualVolume * (demand.programYears || 1);
    const capexPerPart = programParts > 0 ? +(c.capexTotal / programParts).toFixed(3) : 0;
    const procs = m.stations.filter((s) => s.role === "process");
    const operators = procs.reduce((a, s) => a + s.operators * Math.max(1, s.parallelUnits ?? 1), 0);
    const parallelUnits = procs.reduce((a, s) => a + Math.max(1, s.parallelUnits ?? 1), 0);
    const lineOut = r.balance.lineOut;
    return {
      model: m,
      letter: r.letter,
      composite: r.composite,
      loadedCostPerPart: +(c.costPerPart + capexPerPart).toFixed(3),
      costPerPart: c.costPerPart,
      capexPerPart,
      capexTotal: c.capexTotal,
      lineOut,
      takt: r.balance.takt,
      meetsDemand: perShift <= 0 || lineOut >= Math.floor(perShift),
      operators,
      stations: procs.length,
      parallelUnits,
      overCapacityPct: perShift > 0 ? Math.max(0, Math.round(((lineOut - perShift) / perShift) * 100)) : 0,
      floorSpace: c.floorSpace,
      currency: c.currency,
    };
  }, [step, api.model, api.rating, demand, perShift]);

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
        setSelZone(null);
        setSelFlow(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selZone != null) {
        e.preventDefault();
        api.commit({ type: "REMOVE_NOGO", index: selZone });
        setSelZone(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selId) {
        e.preventDefault();
        api.commit({ type: "DELETE_STATION", id: selId });
        setSel(null);
        return;
      }
      if (e.key === "1") setView("actual");
      if (e.key === "2") setView("split");
      if (e.key === "3") setView("dag");
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
  }, [api, selId, selZone, model.stations, showSettings]);

  const panelProps: PanelProps = { api, selId, setSel, setTab, setView, mode, setMode };

  function vBtn(k: View, label: string, Icon: typeof Layers) {
    return (
      <Button size="sm" kind={view === k ? "primary" : "ghost"} renderIcon={Icon} onClick={() => setView(k)}>
        {label}
      </Button>
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
  const cost = useMemo(() => costAnalysis(model), [model]);

  // §4: the optimizer's output is a proposal, not a write. Recomputed with the
  // rating; dismissal is cleared whenever a genuinely new one appears.
  const proposal = useMemo(() => makePlacementProposal(model, rating), [model, rating]);
  useEffect(() => { setProposalDismissed(false); }, [proposal?.baseSignature]);

  // Applying the optimised layout — reused by the Improved view and the
  // one-click Optimize modal. Non-destructive: a form re-lay is an
  // APPLY_TEMPLATE, a reposition is an ACCEPT_PROPOSAL, both undoable.
  const applyImproved = useCallback(() => {
    if (improved.strategy === "form" && improved.form) {
      api.commit({ type: "APPLY_TEMPLATE", form: improved.form });
      toast(`Applied ${improved.form}-form layout`);
    } else if (proposal) {
      api.commit({ type: "ACCEPT_PROPOSAL", items: proposal.items, itemIds: proposal.items.map((i) => i.stationId) });
      toast(`${proposal.items.length} move${proposal.items.length === 1 ? "" : "s"} accepted`);
    }
    setView("actual");
  }, [api, improved.strategy, improved.form, proposal, toast]);

  // Promote a documentation group's machines into a reusable subflow: capture the
  // machines whose centre falls inside the group box, plus their internal flows,
  // with the entry/exit ports derived automatically. Reusable from the Library.
  const saveGroupAsSubflow = useCallback((groupId: string) => {
    const g = (model.groups ?? []).find((x) => x.id === groupId);
    if (!g) return;
    const inside = model.stations.filter(
      (s) => s.role === "process" && s.x + s.w / 2 >= g.x && s.x + s.w / 2 <= g.x + g.w && s.y + s.h / 2 >= g.y && s.y + s.h / 2 <= g.y + g.h,
    );
    if (inside.length < 2) { toast("A subflow needs at least two machines inside the group", "warn"); return; }
    const sf = makeSubflow(model, inside.map((s) => s.id), g.label);
    if (sf) { subflows.add(sf); toast(`Saved “${sf.name}” as a reusable subflow (${sf.inputs?.length ?? 0} in · ${sf.outputs?.length ?? 0} out)`); }
  }, [model, subflows, toast]);

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
      <div className="canvasInner-fill">
        <LayoutCanvas
          model={model}
          stations={model.stations}
          flows={model.flows}
          chain={api.chain}
          conflictIds={realismConflictIds}
          fill
          ghost={rating.optimized}
          proposalItems={proposal?.items}
          onAcceptMove={(id) => {
            if (!proposal) return;
            api.commit({ type: "ACCEPT_PROPOSAL", items: proposal.items, itemIds: [id] });
            toast(`${proposal.items.find((i) => i.stationId === id)?.name ?? "Move"} accepted`);
          }}
          selId={selId}
          selZone={selZone}
          onSelectZone={setSelZone}
          onUpdateNoGo={(index, patch) => api.live({ type: "UPDATE_NOGO", index, patch })}
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
            // A "group" is a documentation annotation drawn around machines — a
            // labelled, commented box that stays on the canvas. (A reusable
            // subflow is made from the group afterwards, see the group editor.)
            setMode("select");
            const inside = model.stations.filter(
              (s) => s.role === "process" && s.x + s.w / 2 >= z.x && s.x + s.w / 2 <= z.x + z.w && s.y + s.h / 2 >= z.y && s.y + s.h / 2 <= z.y + z.h,
            );
            const id = "grp-" + Math.random().toString(36).slice(2, 9);
            api.commit({ type: "ADD_GROUP", group: { id, x: z.x, y: z.y, w: z.w, h: z.h, label: `Group of ${inside.length}`, comment: "" } });
            setSel(null); setSelZone(null); setSelGroup(id);
            toast("Group added — add a comment to document it");
          }}
          selGroup={selGroup}
          onSelectGroup={setSelGroup}
          onUpdateGroup={(id, patch) => api.live({ type: "UPDATE_GROUP", id, patch })}
        />
        {selFlow ? <FlowEditorPopover api={api} flow={selFlow} onClose={() => setSelFlow(null)} /> : null}
        {selGroup ? <GroupEditorPopover api={api} groupId={selGroup} onClose={() => setSelGroup(null)} onSaveSubflow={saveGroupAsSubflow} /> : null}
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
  } else if (view === "dag") {
    canvasInner = <DagView model={model} chain={api.chain} selId={selId} onSelect={selectAndInspect} criticalPath={rating.balance.criticalPath} balance={rating.balance} />;
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
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <Tabs
            selectedIndex={Math.max(0, ANALYSIS_TABS.findIndex((t) => t.tab === analysisTab))}
            onChange={({ selectedIndex }: { selectedIndex: number }) => setAnalysisTab(ANALYSIS_TABS[selectedIndex].tab)}
          >
            <TabList aria-label="Analysis sections" contained>
              {ANALYSIS_TABS.map((t) => (
                <CarbonTab key={t.tab}>{t.label}</CarbonTab>
              ))}
            </TabList>
          </Tabs>
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
  // Each is wrapped in <Theme> so the entry/workspace screen re-themes with the
  // editor (they render OUTSIDE ProcessShell's Theme).
  // Every route gets the same Carbon UI Shell top bar (AppHeader) so the top bar
  // is identical across the workspace, pages, planner and editor.
  const page = (node: React.ReactNode, active: HeaderSection = null) => (
    <Theme theme={theme}>
      <div className="wrap">
        <AppHeader theme={theme} onToggleTheme={toggleTheme} active={active} />
        {node}
      </div>
    </Theme>
  );
  if (route === "/workspace") return page(<WorkspacePage api={api} onGuided={startGuided} />, "workspace");
  if (route === "/library") return page(<LibraryPage api={api} subflows={subflows} library={library} />, "library");
  if (route === "/compare") return page(<ComparePage api={api} />, "compare");
  if (route === "/archive") return page(<ArchivePage api={api} />, "workspace");
  if (route === "/admin") return page(<AdminPage />, null);

  const editorToolbar = (
    <div className="editorbar">
      {reached.includes("concepts") ? (
        <>
          <Button size="sm" kind="ghost" renderIcon={ArrowLeft} onClick={() => goTo("concepts")} title="Back to the concept comparison to change steps or pick another option">
            Concepts
          </Button>
          <span className="hsep" />
        </>
      ) : null}
      <HeaderKpis api={api} />
      <div className="spacer" />
      <Button size="sm" kind="primary" onClick={() => goTo("summary")}>
        Continue to summary
      </Button>
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
              {vBtn("actual", "Actual", Layers)}
              {vBtn("split", "Both", Compare)}
              {vBtn("dag", "DAG", FlowConnection)}
              {vBtn("analysis", "Analysis", ChartColumn)}
            </div>
            {view === "actual" ? (
              <div className="views" style={{ marginLeft: "auto" }} role="group" aria-label="Canvas overlays">
                <Button
                  size="sm"
                  kind="primary"
                  renderIcon={MagicWand}
                  title="Reposition stations for the shortest material path and preview the before/after savings"
                  onClick={() => setShowOptimize(true)}
                >
                  Optimize
                </Button>
                <span className="hsep" />
                <Button
                  size="sm"
                  kind={mode === "group" ? "primary" : "ghost"}
                  renderIcon={GroupObjects}
                  title="Group mode: drag a rectangle around steps to save them as a reusable grouped element"
                  onClick={() => setMode((m) => (m === "group" ? "select" : "group"))}
                >
                  Group
                </Button>
                <span className="hsep" />
                <span style={{ fontSize: "0.75rem", color: TEXTD, alignSelf: "center", marginRight: 6 }}>overlay</span>
                <Button size="sm" kind={overlay === "confidence" ? "primary" : "ghost"} title="Shade steps whose numbers are estimated" onClick={() => setOverlay((o) => (o === "confidence" ? "none" : "confidence"))}>
                  Confidence
                </Button>
                <Button size="sm" kind={overlay === "congestion" ? "primary" : "ghost"} title="Heat by per-step utilization; the bottleneck reads hottest" onClick={() => setOverlay((o) => (o === "congestion" ? "none" : "congestion"))}>
                  Congestion
                </Button>
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
                links: <span style={{ color: TEAL }}>━</span>chained <span style={{ color: RED }}>┅</span>auto-island <span style={{ color: AMBER }}>┅</span>mixed
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
            <div className="rail-tabbar">
              <Tabs
                selectedIndex={Math.max(0, RAIL_TABS.findIndex((t) => t.tab === tab))}
                onChange={({ selectedIndex }: { selectedIndex: number }) => setTab(RAIL_TABS[selectedIndex].tab)}
              >
                <TabList aria-label="Editor inputs" contained>
                  {RAIL_TABS.map((t) => (
                    <CarbonTab key={t.tab} title={t.title}>
                      {t.label}
                    </CarbonTab>
                  ))}
                </TabList>
              </Tabs>
              <IconButton kind="ghost" size="sm" label="Collapse inputs panel" align="bottom" onClick={() => setConfigCollapsed(true)}>
                <SidePanelClose />
              </IconButton>
            </div>
          </div>
          {tab === "workload" && <WorkloadPanel {...panelProps} />}
          {tab === "flow" && <FlowPanel {...panelProps} />}
          {tab === "inspect" && <ConfigurePanel {...panelProps} />}
          {tab === "doc" && (
            <div className="pad">
              {(() => {
                const s = model.stations.find((x) => x.id === selId);
                return s ? <StationDoc station={s} /> : <div style={{ color: TEXTD, fontSize: "0.75rem" }}>Select a step on the canvas to read its full data sheet.</div>;
              })()}
            </div>
          )}
          {tab === "schema" && <SchemaPanel />}
          {(tab === "rating" || tab === "balance" || tab === "auto" || tab === "cost") && (
            <div className="pad" style={{ color: TEXTD, fontSize: "0.75rem" }}>
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
          // Leaving Concepts materialises the chosen candidate into the
          // workspace. If this guided session already created a concept, update
          // it in place (so changed steps flow through); otherwise create one.
          if (step === "concepts" && picked) {
            const sig = `${picked.id}|${picked.model.stations.length}|${Math.round(
              picked.model.stations.reduce((a, s) => a + s.cycleTimeSec, 0),
            )}`;
            const exists = guidedCell.current && api.cells.some((c) => c.id === guidedCell.current);
            if (!exists) {
              guidedCell.current = api.createConcept(picked.model.name, null, picked.model);
              toast(`Created concept ${picked.conceptLabel} (${picked.form}-form).`);
            } else if (sig !== guidedSig.current) {
              // Steps or the chosen concept changed — refresh the layout in place.
              api.switchCell(guidedCell.current!);
              api.reset(picked.model);
              toast(`Updated concept to ${picked.conceptLabel} (${picked.form}-form).`);
            } else {
              // Nothing changed — keep the user's edits, just open the editor.
              api.switchCell(guidedCell.current!);
            }
            guidedSig.current = sig;
            setSel(null);
            setView("actual");
            setTab("inspect");
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
    <ProcessShell step={step} reached={reached} onGoto={goTo} fullBleed={step === "refine"} theme={theme} onToggleTheme={toggleTheme}>
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
          steps={processSteps}
          onChange={setProcessSteps}
          routing={{ transport: demand.transport, partWeightKg: demand.partWeightKg }}
          onRouting={(patch) => setDemand((d) => ({ ...d, ...patch }))}
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

      {step === "summary" ? <SummaryStep picked={picked} live={liveSummary} useCase={useCase} candidates={candidates} onRefine={() => goTo("refine")} /> : null}

      {step !== "refine" ? stepNav : null}

      {hover ? <StationTooltip station={hover.station} x={hover.x} y={hover.y} shiftHours={model.shiftHours ?? 8} /> : null}

      {showOptimize ? (
        <OptimizeModal
          open
          model={model}
          improved={improved}
          rating={rating}
          cost={cost}
          onApply={applyImproved}
          onPreview={() => { setShowOptimize(false); setView("split"); }}
          onClose={() => setShowOptimize(false)}
        />
      ) : null}
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
