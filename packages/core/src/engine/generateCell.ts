import type { AutoState, CycleBreakdown, Station, StationType, VariantMode, WorkElement } from "../model/types";
import { normalizeStation } from "../model/defaults";
import type { AssignedStation, AssignmentResult } from "./assign";
import { assignStations } from "./assign";
import type { InferenceResult, RawStep } from "./infer";
import { inferWorkload } from "./infer";

// The generation pipeline: names in, placed cell out.
//
//   raw step names
//     → infer   (capability, classification, attended fraction, precedence)
//     → assign  (SALBP-1: how many stations, and what each one does)
//     → build   (stations with cycle breakdown, manning, capabilities)
//     → place   (topology template — done by the caller)
//
// Nothing here is typed by the planner except the step names. Every derived
// field is traceable back through `inference.notes` and `assignment`.

/** Capability category → the closest StationType in the layout model. */
const TYPE_BY_PREFIX: Array<[string, StationType]> = [
  ["inspect", "quality"],
  ["test", "quality"],
  ["transport", "buffer"],
  ["wait", "buffer"],
  ["handle.pack", "store"],
];

function stationType(capabilityIds: string[], attendedFraction: number): StationType {
  for (const [prefix, type] of TYPE_BY_PREFIX) {
    if (capabilityIds.some((c) => c.startsWith(prefix))) return type;
  }
  // Mostly hands-on work is a manual bench; otherwise it is equipment.
  return attendedFraction > 0.8 ? "manual" : "machine";
}

/** Automation follows how much of the work binds an operator. */
function autoState(attendedFraction: number): AutoState {
  if (attendedFraction <= 0.25) return "auto";
  if (attendedFraction <= 0.7) return "semi";
  return "manual";
}

/**
 * Fold a station's work elements into the legacy CycleBreakdown, so the
 * existing Yamazumi, value-add ratio and balance panels work unchanged.
 */
function breakdownOf(elements: WorkElement[], secondsOf: (el: WorkElement) => number): CycleBreakdown {
  const b: CycleBreakdown = { valueAddSec: 0, handlingSec: 0, walkSec: 0, waitSec: 0, setupSec: 0 };
  elements.forEach((el) => {
    const sec = secondsOf(el);
    if (el.classification === "VA") b.valueAddSec += sec;
    else if (el.wasteClass === "transport") b.walkSec += sec;
    else if (el.wasteClass === "waiting") b.waitSec += sec;
    else b.handlingSec += sec;
  });
  return {
    valueAddSec: +b.valueAddSec.toFixed(1),
    handlingSec: +b.handlingSec.toFixed(1),
    walkSec: +b.walkSec.toFixed(1),
    waitSec: +b.waitSec.toFixed(1),
    setupSec: 0,
  };
}

/** A readable station name from what it actually does. */
function nameFor(station: AssignedStation, byId: Map<string, WorkElement>, index: number): string {
  const names = station.elementIds.map((id) => byId.get(id)?.name).filter((n): n is string => !!n);
  if (names.length === 0) return `Station ${index + 1}`;
  if (names.length === 1) return names[0];
  // Two elements: join them. More: lead with the first and count the rest.
  return names.length === 2 ? `${names[0]} + ${names[1]}` : `${names[0]} +${names.length - 1}`;
}

export interface StationBuildOptions {
  /** Indicative equipment cost per generated station. */
  capexPerStation?: number;
  energyKw?: number;
  changeoverMin?: number;
  /** Multiplier applied to every element's time before assignment. */
  cycleFactor?: number;
}

/**
 * Turn an assignment into layout-model stations.
 *
 * Positions are left at 0,0 — the caller places them with a topology template,
 * because placement is a separate concern (and a separate solver).
 */
export function stationsFromAssignment(
  assignment: AssignmentResult,
  elements: WorkElement[],
  variantModes: VariantMode[] | undefined,
  opts: StationBuildOptions = {},
): Station[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const modes = variantModes && variantModes.length ? variantModes : null;
  // Worst-mode seconds per element, matching what the assignment sized against.
  const worstOf = (el: WorkElement) => {
    if (!modes) return el.time.seconds;
    return Math.max(...modes.map((m) => el.time.seconds * (m.elementOverrides[el.id] ?? 1)));
  };
  // Share-weighted seconds — what the element costs on an average part, which
  // is what the cell actually runs. Shares are normalised so a mix that does
  // not quite sum to 1 still weights proportionally rather than scaling the
  // whole cell up or down.
  const shareSum = modes ? modes.reduce((a, m) => a + Math.max(0, m.share), 0) : 0;
  const mixOf = (el: WorkElement) => {
    if (!modes || shareSum <= 0) return el.time.seconds;
    const w = modes.reduce(
      (a, m) => a + el.time.seconds * (m.elementOverrides[el.id] ?? 1) * (Math.max(0, m.share) / shareSum),
      0,
    );
    return w;
  };

  return assignment.stations.map((st, i) => {
    const els = st.elementIds.map((id) => byId.get(id)).filter((e): e is WorkElement => !!e);
    const attended = st.cycleTimeSec > 0 ? st.attendedSec / st.cycleTimeSec : 1;
    const type = stationType(st.capabilityIds, attended);
    const ergo = els.some((e) => e.ergonomicLoad === "heavy")
      ? "high"
      : els.some((e) => e.ergonomicLoad === "medium")
        ? "med"
        : "low";

    return normalizeStation({
      id: st.id,
      name: nameFor(st, byId, i),
      role: "process",
      type,
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      fixed: false,
      auto: autoState(attended),
      operators: st.operators,
      cycle: breakdownOf(els, worstOf),
      // Sized for the worst mode above; runs at the mix. Both are recorded so
      // utilisation is not reported against a part the cell rarely makes.
      mixCycleSec: modes ? +els.reduce((a, e) => a + mixOf(e), 0).toFixed(1) : undefined,
      capacityPerShift: 0, // cycle-bound
      changeoverMin: opts.changeoverMin ?? 10,
      ergoRisk: ergo,
      provides: st.capabilityIds,
      capex: opts.capexPerStation ?? 0,
      automationCapex: Math.round((opts.capexPerStation ?? 0) * 0.6),
      energyKw: opts.energyKw ?? 0,
      utilities: attended > 0.8 ? ["power"] : ["power", "air"],
      notes: `Generated from ${els.length} work element(s)`,
    });
  });
}

export interface WorkloadPipelineResult {
  inference: InferenceResult;
  elements: WorkElement[];
  assignment: AssignmentResult;
  stations: Station[];
  taktSec: number;
}

/**
 * Names → inferred elements → balanced stations. The whole input burden is the
 * `steps` array; `perShiftTarget` and `shiftHours` set the takt.
 */
export function buildWorkloadStations(
  steps: RawStep[],
  perShiftTarget: number,
  shiftHours: number,
  variantModes?: VariantMode[],
  opts: StationBuildOptions = {},
): WorkloadPipelineResult {
  const inference = inferWorkload(steps);

  // Concept scaling happens on the elements, before balancing, so the station
  // count reflects the automation choice rather than being scaled afterwards.
  const factor = opts.cycleFactor ?? 1;
  const elements: WorkElement[] =
    factor === 1
      ? inference.elements
      : inference.elements.map((e) => ({
          ...e,
          time: { ...e.time, seconds: +Math.max(0.1, e.time.seconds * factor).toFixed(1) },
        }));

  const taktSec = perShiftTarget > 0 ? (shiftHours * 3600) / perShiftTarget : 0;
  // One station per step: each routing step is its own box on the canvas rather
  // than being merged into a shared station by the balancer. Utilisation is
  // still computed against takt, so an over-takt step still reads as a
  // bottleneck — the steps just are not packed together.
  const assignment = assignStations(elements, taktSec, variantModes, { oneStationPerStep: true });
  const stations = stationsFromAssignment(assignment, elements, variantModes, opts);

  return { inference, elements, assignment, stations, taktSec: +taktSec.toFixed(2) };
}
