import type { Model } from "../model/types";
import type { Capability } from "../model/capabilities";
import { catalogFor, capabilityIndex } from "../model/capabilities";

// Capability coverage — spec §18 Gate 1, the cheap set-operation gate the tool
// exists to answer (§1): "can this set of parts be produced on this line, and if
// not, what capability is missing?" A workload demands capabilities; the
// resources (stations) provide them; an `alternatives` substitution can cover a
// demand indirectly. What is neither provided nor substitutable is the blocker.

export type CoverStatus = "covered" | "alternative" | "missing";

export interface CapabilityStatus {
  id: string;
  name: string;
  status: CoverStatus;
  /** The provided capability that substitutes, when status === "alternative". */
  via?: string;
  viaName?: string;
}

export interface CoverageResult {
  required: CapabilityStatus[];
  providedIds: string[];
  covered: number;
  alternative: number;
  missing: number;
  /** Gate 1 passes when nothing required is missing (§18). */
  gate1Pass: boolean;
  /** True when the workload declares no capabilities — nothing to assess yet. */
  empty: boolean;
}

/**
 * Assess whether the cell's resources cover the workload's required
 * capabilities. Required = the distinct capability ids on the work elements;
 * provided = the union of every station's `provides`. Alternatives are resolved
 * symmetrically through the catalog, because substitutability is mutual.
 */
export function capabilityCoverage(model: Model, catalog: Capability[] = catalogFor(model)): CoverageResult {
  const idx = capabilityIndex(catalog);
  const nameOf = (id: string) => idx.get(id)?.name ?? id;

  const required = [...new Set((model.workElements ?? []).map((e) => e.capabilityId).filter((c): c is string => !!c))];
  const provided = new Set((model.stations ?? []).flatMap((s) => s.provides ?? []));

  // p can substitute for c if the catalog links them as alternatives, in either
  // direction (weld↔bolt, visual↔functional test).
  const substitutes = (c: string, p: string): boolean => {
    if (p === c) return true;
    const ca = idx.get(c)?.alternatives ?? [];
    const pa = idx.get(p)?.alternatives ?? [];
    return ca.includes(p) || pa.includes(c);
  };

  const statuses: CapabilityStatus[] = required.map((c) => {
    if (provided.has(c)) return { id: c, name: nameOf(c), status: "covered" };
    const via = [...provided].find((p) => substitutes(c, p));
    if (via) return { id: c, name: nameOf(c), status: "alternative", via, viaName: nameOf(via) };
    return { id: c, name: nameOf(c), status: "missing" };
  });

  const covered = statuses.filter((s) => s.status === "covered").length;
  const alternative = statuses.filter((s) => s.status === "alternative").length;
  const missing = statuses.filter((s) => s.status === "missing").length;

  return {
    required: statuses,
    providedIds: [...provided],
    covered,
    alternative,
    missing,
    gate1Pass: required.length > 0 && missing === 0,
    empty: required.length === 0,
  };
}
