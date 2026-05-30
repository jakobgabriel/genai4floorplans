import type { Model } from "../model/types";
import type { ChainResult } from "../engine/automation";
import { dagLayout } from "../engine/dag";
import { AMBER, LINE, PANEL2, RED, TEAL, TEALD, TEXT, TEXTD } from "./colors";

// Process flow rendered as a layered DAG: topological columns, directed
// arrowheads, scrap stubs, and an explicit cycle warning when the flow graph
// turns out not to be acyclic.
const NODE_W = 132;
const NODE_H = 40;
const COL_GAP = 200;
const ROW_GAP = 74;
const PAD = 24;

export function DagView({ model, chain, selId, onSelect, criticalPath = [] }: { model: Model; chain: ChainResult; selId: string | null; onSelect: (id: string) => void; criticalPath?: string[] }) {
  const dag = dagLayout(model.stations, model.flows);
  const kind: Record<string, string> = {};
  chain.links.forEach((l) => (kind[l.from + ">" + l.to] = l.kind));
  const units: Record<string, number> = {};
  const assemble: Record<string, boolean> = {};
  const inCount: Record<string, number> = {};
  model.flows.forEach((f) => (inCount[f.to] = (inCount[f.to] ?? 0) + 1));
  model.stations.forEach((s) => {
    units[s.id] = Math.max(1, s.parallelUnits ?? 1);
    assemble[s.id] = (s.mergeMode ?? "sum") === "assemble" && (inCount[s.id] ?? 0) > 1;
  });
  const cpEdges = new Set<string>();
  for (let i = 0; i < criticalPath.length - 1; i++) cpEdges.add(criticalPath[i] + ">" + criticalPath[i + 1]);
  const shareLabel = (from: string, to: string): string | null => {
    const src = model.stations.find((s) => s.id === from);
    if ((src?.splitMode ?? "distribute") !== "distribute") return null;
    const sibs = model.flows.filter((f) => f.from === from);
    if (sibs.length < 2) return null;
    const f = sibs.find((x) => x.to === to);
    if (!f || f.share == null) return null;
    return Math.round(f.share * 100) + "%";
  };

  const pos: Record<string, { x: number; y: number }> = {};
  dag.nodes.forEach((n) => {
    pos[n.id] = { x: PAD + n.layer * COL_GAP, y: PAD + 30 + n.row * ROW_GAP };
  });
  const maxRows = Math.max(1, ...dag.rowsPerLayer);
  const W = PAD * 2 + Math.max(1, dag.layers) * COL_GAP;
  const H = PAD * 2 + 30 + maxRows * ROW_GAP;

  const edgeColor = (k?: string) => (k === "auto-island" ? RED : k === "chained-auto" ? TEAL : k === "mixed" ? AMBER : TEXTD);

  return (
    <div>
      <div className="layoutTitle" style={{ color: TEAL }}>
        PROCESS DAG
      </div>
      {dag.hasCycle ? (
        <div className="issue" style={{ cursor: "default", marginBottom: 8 }}>
          <span style={{ color: RED }}>● </span>
          This flow contains a cycle — highlighted edges loop backward, so the process is not a true DAG. Remove a back-edge to make it acyclic.
        </div>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="dag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>

        {dag.edges.map((e, i) => {
          const a = pos[e.from];
          const b = pos[e.to];
          if (!a || !b) return null;
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          const onCp = cpEdges.has(e.from + ">" + e.to);
          const col = e.back ? RED : onCp ? TEAL : edgeColor(kind[e.from + ">" + e.to]);
          const midX = (x1 + x2) / 2;
          const d = e.back
            ? `M${x1} ${y1} C ${x1 + 60} ${y1 - 50}, ${x2 - 60} ${y2 - 50}, ${x2} ${y2}`
            : `M${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
          const wdt = (1 + Math.min(4, (e.volume / 1200) * 3)) * (onCp ? 1.6 : 1);
          const sl = shareLabel(e.from, e.to);
          return (
            <g key={"e" + i}>
              <path d={d} fill="none" stroke={col} strokeWidth={wdt} strokeDasharray={e.back ? "5 4" : undefined} opacity={onCp ? 1 : 0.8} markerEnd="url(#dag-arrow)" />
              {sl ? (
                <text x={midX} y={(y1 + y2) / 2 - 4} fill={TEXTD} fontSize={9} textAnchor="middle">
                  {sl}
                </text>
              ) : null}
            </g>
          );
        })}

        {dag.nodes.map((n) => {
          const p = pos[n.id];
          const sel = n.id === selId;
          const onCp = criticalPath.includes(n.id);
          const roleCol = n.role === "input" ? TEAL : n.role === "output" ? AMBER : TEALD;
          return (
            <g key={n.id} style={{ cursor: "pointer" }} onClick={() => onSelect(n.id)}>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={7} fill={PANEL2} stroke={sel ? TEAL : onCp ? TEAL : roleCol} strokeWidth={sel || onCp ? 2.5 : 1.4} />
              <text x={p.x + NODE_W / 2} y={p.y + 16} fill={TEXT} fontSize={11} fontWeight={600} textAnchor="middle" style={{ fontFamily: "'IBM Plex Sans',sans-serif" }}>
                {n.name.length > 16 ? n.name.slice(0, 15) + "…" : n.name}
              </text>
              <text x={p.x + NODE_W / 2} y={p.y + 30} fill={TEXTD} fontSize={8} textAnchor="middle">
                {n.role}
                {units[n.id] > 1 ? "  ·  ×" + units[n.id] : ""}
                {n.scrapRate > 0 ? "  ·  scrap " + Math.round(n.scrapRate * 100) + "%" : ""}
              </text>
              {assemble[n.id] ? (
                <text x={p.x + 6} y={p.y + 14} fill={AMBER} fontSize={11}>
                  ⋈
                </text>
              ) : null}
              {/* in (left) / out (right) ports */}
              <circle cx={p.x} cy={p.y + NODE_H / 2} r={3} fill={TEAL} />
              <circle cx={p.x + NODE_W} cy={p.y + NODE_H / 2} r={3} fill={AMBER} />
              {/* scrap stub */}
              {n.scrapRate > 0 ? (
                <line x1={p.x + NODE_W / 2} y1={p.y + NODE_H} x2={p.x + NODE_W / 2} y2={p.y + NODE_H + 16} stroke={RED} strokeWidth={1.3} strokeDasharray="3 2" markerEnd="url(#dag-arrow)" />
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span>
          columns = process layers · <span style={{ color: TEAL }}>●</span> in <span style={{ color: AMBER }}>●</span> out
        </span>
        <span style={{ color: RED }}>┅ scrap / back-edge</span>
        <span style={{ color: TEALD }}>arrows = material direction</span>
      </div>
      <div className="hint" style={{ borderTop: "1px solid " + LINE, paddingTop: 8 }}>
        {dag.layers} layer(s) · click a node to configure it.
      </div>
    </div>
  );
}
