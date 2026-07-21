import type { Model } from "../model/types";
import type { Capability } from "../model/capabilities";
import { catalogFor, capabilityIndex } from "../model/capabilities";

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
