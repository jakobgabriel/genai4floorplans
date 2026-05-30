import type { Flow, Role, Station } from "../model/types";

export interface DagNode {
  id: string;
  name: string;
  role: Role;
  scrapRate: number;
  layer: number;
  row: number;
}

export interface DagEdge {
  from: string;
  to: string;
  volume: number;
  /** A back-edge — its presence means the flow graph is not acyclic. */
  back: boolean;
}

export interface DagResult {
  nodes: DagNode[];
  edges: DagEdge[];
  layers: number;
  rowsPerLayer: number[];
  hasCycle: boolean;
}

// Layered layout for the process flow as a DAG. Layers come from a
// longest-path assignment over a Kahn topological order; back-edges (which make
// the graph cyclic) are detected with a DFS colouring and flagged rather than
// silently drawn forward.
export function dagLayout(stations: Station[], flows: Flow[]): DagResult {
  const ids = stations.map((s) => s.id);
  const idSet = new Set(ids);
  const edgesIn = flows.filter((f) => idSet.has(f.from) && idSet.has(f.to));

  const adj: Record<string, string[]> = {};
  const indeg: Record<string, number> = {};
  ids.forEach((i) => {
    adj[i] = [];
    indeg[i] = 0;
  });
  edgesIn.forEach((f) => {
    adj[f.from].push(f.to);
    indeg[f.to]++;
  });

  // Kahn topological order (ignores cycles; leftovers handled after).
  const queue = ids.filter((i) => indeg[i] === 0);
  const indegWork = { ...indeg };
  const topo: string[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const n = queue.shift() as string;
    if (seen.has(n)) continue;
    seen.add(n);
    topo.push(n);
    adj[n].forEach((m) => {
      indegWork[m]--;
      if (indegWork[m] <= 0) queue.push(m);
    });
  }
  ids.forEach((i) => {
    if (!seen.has(i)) topo.push(i);
  });

  // Longest-path layering along the topo order.
  const layer: Record<string, number> = {};
  ids.forEach((i) => (layer[i] = 0));
  topo.forEach((n) => {
    adj[n].forEach((m) => {
      layer[m] = Math.max(layer[m], layer[n] + 1);
    });
  });

  // DFS to flag back-edges (cycles).
  const color: Record<string, number> = {}; // 0=white,1=grey,2=black
  ids.forEach((i) => (color[i] = 0));
  const backSet = new Set<string>();
  function dfs(u: string) {
    color[u] = 1;
    for (const v of adj[u]) {
      if (color[v] === 1) backSet.add(u + ">" + v);
      else if (color[v] === 0) dfs(v);
    }
    color[u] = 2;
  }
  ids.forEach((i) => {
    if (color[i] === 0) dfs(i);
  });

  const rowCounter: Record<number, number> = {};
  const nodes: DagNode[] = stations.map((s) => {
    const l = layer[s.id] ?? 0;
    const row = rowCounter[l] ?? 0;
    rowCounter[l] = row + 1;
    return { id: s.id, name: s.name, role: s.role, scrapRate: s.scrapRate ?? 0, layer: l, row };
  });

  const layers = nodes.reduce((m, n) => Math.max(m, n.layer + 1), 0);
  const rowsPerLayer: number[] = [];
  for (let l = 0; l < layers; l++) rowsPerLayer[l] = rowCounter[l] ?? 0;

  const edges: DagEdge[] = edgesIn.map((f) => ({
    from: f.from,
    to: f.to,
    volume: f.volume,
    back: backSet.has(f.from + ">" + f.to),
  }));

  return { nodes, edges, layers, rowsPerLayer, hasCycle: backSet.size > 0 };
}
