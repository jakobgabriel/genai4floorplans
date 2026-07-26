import type { Model, Station } from "../model/types";
import { isFlowFunction } from "../model/types";

// Pattern mining (spec §30–35 "highest-value mechanic", audit C-12). A pattern
// library is only as good as what fills it — and the richest source is the work
// an engineer has already done. This mines RECURRING process motifs across a set
// of models (the live layouts plus their immutable snapshots, which C-10 makes
// available): directed station-type chains that appear more than once, so the
// tool proposes reusable building blocks the user actually keeps drawing.
//
// A motif is canonicalised by the sequence of station TYPES along a directed
// flow path (machine→quality→buffer …). Type — not capability or name — because
// it is present on every station, so a motif matches across layouts that were
// modelled independently. Each occurrence keeps its concrete station ids so a
// candidate can be extracted into a real grouped element.

export interface PatternSource {
  /** Stable key so an instance can be traced back to its model. */
  key: string;
  name?: string;
  model: Model;
}

export interface PatternInstance {
  key: string;
  name?: string;
  /** The concrete member station ids, in flow order. */
  stationIds: string[];
  /** Member station names, for display. */
  names: string[];
}

export interface PatternCandidate {
  /** Canonical type-chain signature, e.g. "machine>quality>buffer". */
  signature: string;
  /** Human label, e.g. "Machine → Quality → Buffer". */
  label: string;
  /** Stations in the chain. */
  size: number;
  /** Total occurrences across all sources. */
  occurrences: number;
  /** Distinct sources (layouts/snapshots) it appears in. */
  sources: number;
  instances: PatternInstance[];
}

export interface MineOptions {
  /** Shortest chain to consider (stations). Default 2. */
  minLen?: number;
  /** Longest chain to consider (stations). Default 4. */
  maxLen?: number;
  /** Keep a motif only if it recurs at least this many times total. Default 2. */
  minOccurrences?: number;
  /** Skip sources larger than this (path enumeration guard). Default 40. */
  maxStations?: number;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function minePatterns(sources: PatternSource[], opts: MineOptions = {}): PatternCandidate[] {
  const minLen = Math.max(2, opts.minLen ?? 2);
  const maxLen = Math.max(minLen, opts.maxLen ?? 4);
  const minOccurrences = Math.max(2, opts.minOccurrences ?? 2);
  const maxStations = opts.maxStations ?? 40;

  // signature → instances (deduped by ordered id set within a source).
  const bySig = new Map<string, PatternInstance[]>();
  const seen = new Set<string>(); // key|id,id,id — guards duplicate enumeration

  for (const src of sources) {
    const stations = src.model.stations.filter((s) => s.role === "process" && !isFlowFunction(s));
    if (stations.length < minLen || stations.length > maxStations) continue;
    const byId = new Map(stations.map((s) => [s.id, s] as const));
    const adj = new Map<string, string[]>();
    stations.forEach((s) => adj.set(s.id, []));
    for (const f of src.model.flows) {
      if (byId.has(f.from) && byId.has(f.to) && f.from !== f.to) adj.get(f.from)!.push(f.to);
    }

    // DFS enumerating simple directed paths up to maxLen, recording every path
    // whose length is at least minLen.
    const record = (path: string[]) => {
      if (path.length < minLen) return;
      const dedup = src.key + "|" + path.join(",");
      if (seen.has(dedup)) return;
      seen.add(dedup);
      const members = path.map((id) => byId.get(id)!);
      const signature = members.map((s) => s.type).join(">");
      const inst: PatternInstance = { key: src.key, name: src.name, stationIds: path.slice(), names: members.map((s) => s.name) };
      const list = bySig.get(signature);
      if (list) list.push(inst);
      else bySig.set(signature, [inst]);
    };

    const walk = (path: string[], visited: Set<string>) => {
      if (path.length >= minLen) record(path);
      if (path.length >= maxLen) return;
      const last = path[path.length - 1];
      for (const next of adj.get(last) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        path.push(next);
        walk(path, visited);
        path.pop();
        visited.delete(next);
      }
    };

    for (const s of stations) walk([s.id], new Set([s.id]));
  }

  const candidates: PatternCandidate[] = [];
  for (const [signature, instances] of bySig) {
    if (instances.length < minOccurrences) continue;
    const sourcesCount = new Set(instances.map((i) => i.key)).size;
    candidates.push({
      signature,
      label: signature.split(">").map(cap).join(" → "),
      size: signature.split(">").length,
      occurrences: instances.length,
      sources: sourcesCount,
      instances,
    });
  }

  // Rank: appears in the most distinct layouts first (broadest reuse), then
  // total occurrences, then the larger motif, then a stable signature order.
  candidates.sort(
    (a, b) => b.sources - a.sources || b.occurrences - a.occurrences || b.size - a.size || a.signature.localeCompare(b.signature),
  );
  return candidates;
}

/** The member stations of one instance, from its source model (for extraction). */
export function instanceStations(source: Model, instance: PatternInstance): Station[] {
  const set = new Set(instance.stationIds);
  return source.stations.filter((s) => set.has(s.id));
}
