import type { Model, Station } from "../model/types";
import { DEFAULT_SHIFT_MODEL } from "../model/types";
import type { Capability } from "../model/capabilities";
import { catalogFor, capabilityIndex } from "../model/capabilities";
import { effectiveCycleSec } from "./cycle";

// Product-process feasibility matrix (spec §15/§18 Gate 1, audit C-11). The
// industrialization engineer's core question: of a portfolio of part numbers,
// which can this line make, and which capability blocks the rest? Each part is
// an abstract workload — the SET OF CAPABILITIES it requires — checked against
// what the line's resources provide (directly or via a catalog alternative).

export type CellStatus = "provided" | "alternative" | "missing" | "not-required";

export interface MatrixCell {
  status: CellStatus;
  /** The provided capability substituting, when status === "alternative". */
  via?: string;
  viaName?: string;
}

export interface MatrixColumn {
  id: string;
  name: string;
  category: string;
  /** Number of parts that require this capability. */
  requiredByCount: number;
  /** True when the line provides this capability directly. */
  provided: boolean;
}

export interface PartRow {
  id: string;
  number: string;
  name?: string;
  demandPerYear?: number;
  changeoverFamily?: string;
  /** Capability id → cell. */
  cells: Record<string, MatrixCell>;
  verdict: "runnable" | "blocked";
  /** Required capabilities that are neither provided nor substitutable. */
  missing: string[];
  missingNames: string[];
}

export interface BlockingCapability {
  id: string;
  name: string;
  /** How many parts are blocked because this capability is missing. */
  blockedParts: number;
}

export interface PortfolioMatrix {
  columns: MatrixColumn[];
  rows: PartRow[];
  /** Capabilities the line provides directly (union of station.provides). */
  providedIds: string[];
  runnable: number;
  total: number;
  /** Missing capabilities ranked by how many parts they block — the investment
   *  priority to unlock the most of the portfolio (§18 Gate 1). */
  blocking: BlockingCapability[];
  /** True when the portfolio is empty (nothing to assess). */
  empty: boolean;
}

export function portfolioMatrix(model: Model, catalog: Capability[] = catalogFor(model)): PortfolioMatrix {
  const parts = model.parts ?? [];
  const idx = capabilityIndex(catalog);
  const nameOf = (id: string) => idx.get(id)?.name ?? id;
  const catOf = (id: string) => idx.get(id)?.category ?? "other";

  const provided = new Set((model.stations ?? []).flatMap((s) => s.provides ?? []));
  const substitutes = (c: string, p: string): boolean => {
    if (p === c) return true;
    return (idx.get(c)?.alternatives ?? []).includes(p) || (idx.get(p)?.alternatives ?? []).includes(c);
  };
  const statusFor = (c: string): MatrixCell => {
    if (provided.has(c)) return { status: "provided" };
    const via = [...provided].find((p) => substitutes(c, p));
    if (via) return { status: "alternative", via, viaName: nameOf(via) };
    return { status: "missing" };
  };

  // Columns: every capability any part requires, plus everything the line
  // provides — so the matrix shows both demand and supply.
  const colIds = [...new Set([...parts.flatMap((p) => p.requiredCapabilityIds), ...provided])];
  const requiredByCount = new Map<string, number>();
  parts.forEach((p) => new Set(p.requiredCapabilityIds).forEach((c) => requiredByCount.set(c, (requiredByCount.get(c) ?? 0) + 1)));
  const columns: MatrixColumn[] = colIds
    .map((id) => ({ id, name: nameOf(id), category: catOf(id), requiredByCount: requiredByCount.get(id) ?? 0, provided: provided.has(id) }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const blockedByCap = new Map<string, number>();
  const rows: PartRow[] = parts.map((part) => {
    const required = new Set(part.requiredCapabilityIds);
    const cells: Record<string, MatrixCell> = {};
    const missing: string[] = [];
    columns.forEach((col) => {
      if (!required.has(col.id)) {
        cells[col.id] = { status: "not-required" };
        return;
      }
      const cell = statusFor(col.id);
      cells[col.id] = cell;
      if (cell.status === "missing") {
        missing.push(col.id);
        blockedByCap.set(col.id, (blockedByCap.get(col.id) ?? 0) + 1);
      }
    });
    return {
      id: part.id,
      number: part.number,
      name: part.name,
      demandPerYear: part.demandPerYear,
      changeoverFamily: part.changeoverFamily,
      cells,
      verdict: missing.length === 0 ? "runnable" : "blocked",
      missing,
      missingNames: missing.map(nameOf),
    };
  });

  const blocking: BlockingCapability[] = [...blockedByCap.entries()]
    .map(([id, blockedParts]) => ({ id, name: nameOf(id), blockedParts }))
    .sort((a, b) => b.blockedParts - a.blockedParts || a.name.localeCompare(b.name));

  return {
    columns,
    rows,
    providedIds: [...provided],
    runnable: rows.filter((r) => r.verdict === "runnable").length,
    total: rows.length,
    blocking,
    empty: parts.length === 0,
  };
}

// ---- Capacity gate (spec §18 Gate 3 + Gate 2 volume band, audit C-11) -------
//
// Gate 1 asks "can the line make this part at all?". Gate 3 asks "do all the
// parts you want to run FIT the available time once processing AND changeover
// are counted — and if not, which part do you drop?". A multi-model line runs
// campaigns with a setup between them; every campaign start costs a changeover.

export interface PartLoad {
  id: string;
  number: string;
  runnable: boolean;
  /** Demand sits outside a used station's validated volume band (Gate 2). */
  offVolume: boolean;
  offVolumeNote?: string;
  demandPerYear: number;
  /** Seconds one part occupies the line (Σ cycle of the stations it uses). */
  processingSecPerPart: number;
  processingSecPerYear: number;
  campaignsPerYear: number;
}

export interface DropCandidate {
  id: string;
  number: string;
  /** Line-seconds per year freed by dropping this part (processing + its setups). */
  freedSecPerYear: number;
  demandPerYear: number;
}

export interface PortfolioCapacity {
  /** True when there is enough data to assess (parts with demand + priced line). */
  hasData: boolean;
  availableSecPerYear: number;
  processingSecPerYear: number;
  changeoverSecPerYear: number;
  changeoverMinutesPerSwitch: number;
  switchesPerYear: number;
  totalLoadSecPerYear: number;
  utilizationPct: number;
  overCapacity: boolean;
  parts: PartLoad[];
  /** When over capacity: the cheapest set of parts to drop to fit, ranked by
   *  line-time freed per unit of demand sacrificed (§18 drop_analysis). */
  drop: DropCandidate[];
}

/** Seconds one part occupies the line: for each capability it needs, the fastest
 *  providing station's cycle. A capability nobody provides adds nothing (that is
 *  a Gate 1 miss, surfaced by the matrix). */
function processingSecPerPart(part: { requiredCapabilityIds: string[] }, stations: Station[]): number {
  let sec = 0;
  for (const cap of new Set(part.requiredCapabilityIds)) {
    const providers = stations.filter((s) => (s.provides ?? []).includes(cap) && effectiveCycleSec(s) > 0);
    if (providers.length === 0) continue;
    sec += Math.min(...providers.map((s) => effectiveCycleSec(s)));
  }
  return +sec.toFixed(2);
}

export function portfolioCapacity(model: Model, catalog: Capability[] = catalogFor(model)): PortfolioCapacity {
  const sm = { ...DEFAULT_SHIFT_MODEL, ...(model.demand ?? {}) };
  const availableSecPerYear = Math.max(0, sm.workingDaysPerYear * sm.shiftsPerDay * sm.hoursPerShift * 3600 * sm.oee);

  // Gate 1 verdicts come from the same matrix, so the two stay consistent.
  const gate1 = new Map(portfolioMatrix(model, catalog).rows.map((r) => [r.id, r.verdict === "runnable"]));
  const stations = model.stations ?? [];
  // A full line changeover between campaigns — the slowest setup on the line.
  const changeoverMinutesPerSwitch = stations.reduce((m, s) => Math.max(m, s.changeoverMin || 0), 0);

  const parts: PartLoad[] = (model.parts ?? []).map((p) => {
    const demand = Math.max(0, p.demandPerYear ?? 0);
    const secPart = processingSecPerPart(p, stations);
    const runnable = gate1.get(p.id) ?? false;
    // Gate 2: demand outside any used station's validated volume band.
    let offVolume = false;
    let offVolumeNote: string | undefined;
    for (const cap of new Set(p.requiredCapabilityIds)) {
      const bands = stations.filter((s) => (s.provides ?? []).includes(cap) && s.volumeBand).map((s) => s.volumeBand!);
      if (demand > 0 && bands.length > 0 && !bands.some((b) => demand >= b.minUnitsPerYear && demand <= b.maxUnitsPerYear)) {
        offVolume = true;
        offVolumeNote = `${demand.toLocaleString()}/yr is outside the validated volume band for ${cap}`;
        break;
      }
    }
    return {
      id: p.id,
      number: p.number,
      runnable,
      offVolume,
      offVolumeNote,
      demandPerYear: demand,
      processingSecPerPart: secPart,
      processingSecPerYear: +(demand * secPart).toFixed(2),
      campaignsPerYear: Math.max(1, Math.floor(p.campaignsPerYear ?? 1)),
    };
  });

  // Only parts that can run AND carry demand load the line.
  const counted = parts.filter((p) => p.runnable && p.demandPerYear > 0 && p.processingSecPerPart > 0);
  const processingSecPerYear = +counted.reduce((a, p) => a + p.processingSecPerYear, 0).toFixed(2);
  const switchesPerYear = counted.reduce((a, p) => a + p.campaignsPerYear, 0);
  const changeoverSecPerYear = +(switchesPerYear * changeoverMinutesPerSwitch * 60).toFixed(2);
  const totalLoadSecPerYear = +(processingSecPerYear + changeoverSecPerYear).toFixed(2);
  const utilizationPct = availableSecPerYear > 0 ? +((totalLoadSecPerYear / availableSecPerYear) * 100).toFixed(1) : 0;
  const overCapacity = totalLoadSecPerYear > availableSecPerYear;

  // Drop analysis: sacrifice the part that frees the most line-time per unit of
  // demand lost, until the rest fits.
  const drop: DropCandidate[] = [];
  if (overCapacity) {
    const freedOf = (p: PartLoad) => p.processingSecPerYear + p.campaignsPerYear * changeoverMinutesPerSwitch * 60;
    const ranked = counted.slice().sort((a, b) => freedOf(b) / Math.max(1, b.demandPerYear) - freedOf(a) / Math.max(1, a.demandPerYear));
    let load = totalLoadSecPerYear;
    for (const p of ranked) {
      if (load <= availableSecPerYear) break;
      const freed = freedOf(p);
      drop.push({ id: p.id, number: p.number, freedSecPerYear: +freed.toFixed(2), demandPerYear: p.demandPerYear });
      load -= freed;
    }
  }

  return {
    hasData: counted.length > 0 && availableSecPerYear > 0,
    availableSecPerYear: +availableSecPerYear.toFixed(0),
    processingSecPerYear,
    changeoverSecPerYear,
    changeoverMinutesPerSwitch,
    switchesPerYear,
    totalLoadSecPerYear,
    utilizationPct,
    overCapacity,
    parts,
    drop,
  };
}
