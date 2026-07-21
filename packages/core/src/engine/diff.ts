import type { Model, Station, Flow } from "../model/types";
import { effectiveCycleSec } from "./cycle";

// Model diff (spec §6, audit C-10). A snapshot is an immutable frozen model; to
// make versions/releases meaningful an engineer must see WHAT changed between
// two of them — not a raw JSON dump. This computes a structural, human-readable
// difference: stations added/removed/changed (with the specific fields), and
// flow/grid changes. Pure and deterministic, so it is unit-testable and the same
// two models always diff identically.

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface StationChange {
  id: string;
  name: string;
  kind: "added" | "removed" | "changed";
  /** Field-level changes when kind === "changed". */
  fields: FieldChange[];
}

export interface ModelDiff {
  stations: StationChange[];
  stationsAdded: number;
  stationsRemoved: number;
  stationsChanged: number;
  flowsAdded: number;
  flowsRemoved: number;
  flowsChanged: number;
  gridChanged: boolean;
  gridFrom: string;
  gridTo: string;
  /** One-line human summary of the whole diff. */
  summary: string;
  /** True when the two models differ in any tracked way. */
  changed: boolean;
}

const flowKey = (f: Flow) => `${f.from}→${f.to}`;

/** The station fields worth surfacing between releases, each with a reader. */
const STATION_FIELDS: Array<{ field: string; read: (s: Station) => string }> = [
  { field: "name", read: (s) => s.name },
  { field: "type", read: (s) => s.type },
  { field: "role", read: (s) => s.role },
  { field: "position", read: (s) => `(${s.x},${s.y})` },
  { field: "footprint", read: (s) => `${s.w}×${s.h}` },
  { field: "cycle", read: (s) => `${effectiveCycleSec(s)}s` },
  { field: "operators", read: (s) => String(s.operators) },
  { field: "capacity/shift", read: (s) => String(s.capacityPerShift) },
  { field: "changeover", read: (s) => `${s.changeoverMin}min` },
  { field: "automation", read: (s) => s.auto },
  { field: "parallelUnits", read: (s) => String(s.parallelUnits ?? 1) },
  { field: "scrapRate", read: (s) => String(s.scrapRate ?? 0) },
];

export function modelDiff(prev: Model, next: Model): ModelDiff {
  const prevById = new Map(prev.stations.map((s) => [s.id, s]));
  const nextById = new Map(next.stations.map((s) => [s.id, s]));

  const stations: StationChange[] = [];

  // Removed: in prev, not in next.
  for (const s of prev.stations) {
    if (!nextById.has(s.id)) stations.push({ id: s.id, name: s.name, kind: "removed", fields: [] });
  }
  // Added + changed: walk next in its own order so the list reads top-to-bottom.
  for (const s of next.stations) {
    const before = prevById.get(s.id);
    if (!before) {
      stations.push({ id: s.id, name: s.name, kind: "added", fields: [] });
      continue;
    }
    const fields: FieldChange[] = [];
    for (const f of STATION_FIELDS) {
      const from = f.read(before);
      const to = f.read(s);
      if (from !== to) fields.push({ field: f.field, from, to });
    }
    if (fields.length) stations.push({ id: s.id, name: s.name, kind: "changed", fields });
  }

  const stationsAdded = stations.filter((s) => s.kind === "added").length;
  const stationsRemoved = stations.filter((s) => s.kind === "removed").length;
  const stationsChanged = stations.filter((s) => s.kind === "changed").length;

  // Flows by endpoint pair. A pair present in both but with a different volume /
  // transport / kind counts as changed.
  const prevFlows = new Map(prev.flows.map((f) => [flowKey(f), f]));
  const nextFlows = new Map(next.flows.map((f) => [flowKey(f), f]));
  let flowsAdded = 0;
  let flowsRemoved = 0;
  let flowsChanged = 0;
  for (const [k] of prevFlows) if (!nextFlows.has(k)) flowsRemoved++;
  for (const [k, f] of nextFlows) {
    const before = prevFlows.get(k);
    if (!before) {
      flowsAdded++;
    } else if (before.volume !== f.volume || before.transport !== f.transport || (before.kind ?? "good") !== (f.kind ?? "good")) {
      flowsChanged++;
    }
  }

  const gridFrom = `${prev.gridW}×${prev.gridH}`;
  const gridTo = `${next.gridW}×${next.gridH}`;
  const gridChanged = gridFrom !== gridTo;

  const parts: string[] = [];
  if (stationsAdded) parts.push(`${stationsAdded} station${stationsAdded === 1 ? "" : "s"} added`);
  if (stationsRemoved) parts.push(`${stationsRemoved} removed`);
  if (stationsChanged) parts.push(`${stationsChanged} changed`);
  if (flowsAdded) parts.push(`${flowsAdded} flow${flowsAdded === 1 ? "" : "s"} added`);
  if (flowsRemoved) parts.push(`${flowsRemoved} flow${flowsRemoved === 1 ? "" : "s"} removed`);
  if (flowsChanged) parts.push(`${flowsChanged} flow${flowsChanged === 1 ? "" : "s"} changed`);
  if (gridChanged) parts.push(`grid ${gridFrom}→${gridTo}`);

  const changed = parts.length > 0;
  const summary = changed ? parts.join(", ") : "No differences.";

  return {
    stations,
    stationsAdded,
    stationsRemoved,
    stationsChanged,
    flowsAdded,
    flowsRemoved,
    flowsChanged,
    gridChanged,
    gridFrom,
    gridTo,
    summary,
    changed,
  };
}
