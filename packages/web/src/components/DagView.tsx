import type { Model } from "@flowplan/core/model/types";
import { isFlowFunction, partsPerCycleOf } from "@flowplan/core/model/types";
import type { ChainResult } from "@flowplan/core/engine/automation";
import type { BalanceResult } from "@flowplan/core/engine/balance";
import { effectiveCycleSec } from "@flowplan/core/engine/cycle";
import { dagLayout } from "@flowplan/core/engine/dag";
import { AMBER, LINE, PANEL2, RED, TEAL, TEALD, TEXT, TEXTD, TYPE_COL } from "./colors";

// Process flow as a layered DAG. Each node is a data card carrying the step's
// times and meta (cycle/part, operators, automation, throughput, utilisation),
// and the analysis is drawn ON the graph: the bottleneck, over-takt steps and
// high-scrap steps are flagged in red so the DAG is a place to *read* the line,
// not just its shape.
const NODE_W = 188;
const NODE_H = 84;
const COL_GAP = 250;
const ROW_GAP = 116;
const PAD = 24;

function fmtSec(s: number): string {
  return (Math.round(s * 10) / 10).toString().replace(/\.0$/, "") + "s";
}

export function DagView({
  model,
  chain,
  selId,
  onSelect,
  criticalPath = [],
  balance,
}: {
  model: Model;
  chain: ChainResult;
  selId: string | null;
  onSelect: (id: string) => void;
  criticalPath?: string[];
  balance?: BalanceResult;
}) {
  const dag = dagLayout(model.stations, model.flows);
  const byStation = new Map(model.stations.map((s) => [s.id, s]));
  const byStep = new Map((balance?.steps ?? []).map((st) => [st.id, st]));
  const takt = balance?.takt ?? 0;
  const bottleneckId = balance?.bottleneck?.id ?? null;

  const kind: Record<string, string> = {};
  chain.links.forEach((l) => (kind[l.from + ">" + l.to] = l.kind));
  const inCount: Record<string, number> = {};
  model.flows.forEach((f) => (inCount[f.to] = (inCount[f.to] ?? 0) + 1));
  const assemble: Record<string, boolean> = {};
  model.stations.forEach((s) => {
    assemble[s.id] = (s.mergeMode ?? "sum") === "assemble" && (inCount[s.id] ?? 0) > 1;
  });
  const cpEdges = new Set<string>();
  for (let i = 0; i < criticalPath.length - 1; i++) cpEdges.add(criticalPath[i] + ">" + criticalPath[i + 1]);
  const shareLabel = (from: string, to: string): string | null => {
    const src = byStation.get(from);
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
              <path d={d} fill="none" stroke={col} strokeWidth={wdt} strokeDasharray={e.back ? "5 4" : undefined} opacity={onCp ? 1 : 0.75} markerEnd="url(#dag-arrow)" />
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
          const s = byStation.get(n.id);
          const step = byStep.get(n.id);
          const sel = n.id === selId;
          const onCp = criticalPath.includes(n.id);
          const flowFn = s != null && isFlowFunction(s);
          const isProcess = n.role === "process" && s != null && !flowFn;
          const ppc = s ? partsPerCycleOf(s) : 1;
          const perPart = s ? effectiveCycleSec(s) / ppc : 0;
          const scrap = s?.scrapRate ?? 0;
          const isBn = n.id === bottleneckId;
          const units = Math.max(1, s?.parallelUnits ?? 1);

          // Utilisation bar (process only). Rate already accounts for operators,
          // parallel lanes and parts/cycle, so it is the honest measure of how
          // close a step runs to its limit — not the raw cycle vs takt.
          const util = step ? Math.max(0, Math.min(100, step.util)) : null;
          // A non-bottleneck step running ≥90% is a secondary constraint worth
          // flagging; the bottleneck itself is the hard limit.
          const nearLimit = isProcess && !isBn && util != null && util >= 90;
          const highScrap = scrap >= 0.05;
          const problem = isBn || nearLimit || highScrap;

          const roleCol = n.role === "input" ? TEAL : n.role === "output" ? AMBER : TEALD;
          const border = isBn ? RED : sel || onCp ? TEAL : nearLimit || highScrap ? AMBER : roleCol;
          const typeCol = TYPE_COL[(s?.type ?? "machine") as keyof typeof TYPE_COL] ?? PANEL2;
          const barW = NODE_W - 20;

          return (
            <g key={n.id} style={{ cursor: "pointer" }} onClick={() => onSelect(n.id)}>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={7} fill={PANEL2} stroke={border} strokeWidth={sel || onCp || problem ? 2.5 : 1.4} />
              {/* type accent strip */}
              <rect x={p.x} y={p.y} width={4} height={NODE_H} rx={2} fill={typeCol} />

              {/* title */}
              <text x={p.x + 12} y={p.y + 17} fill={TEXT} fontSize={11.5} fontWeight={700} style={{ fontFamily: "'IBM Plex Sans',sans-serif" }}>
                {n.name.length > 18 ? n.name.slice(0, 17) + "…" : n.name}
              </text>
              {/* type / role tag, right-aligned */}
              <text x={p.x + NODE_W - 8} y={p.y + 17} fill={TEXTD} fontSize={8.5} textAnchor="end">
                {flowFn ? "buffer" : s?.type ?? n.role}
              </text>

              {isProcess ? (
                <>
                  {/* times + manning */}
                  <text x={p.x + 12} y={p.y + 34} fontSize={9.5} fill={TEXTD}>
                    <tspan fill={TEXT} fontWeight={600}>{fmtSec(perPart)}/pt</tspan>
                    {ppc > 1 ? <tspan fill={TEAL}> ×{ppc}</tspan> : null}
                    <tspan> · {s?.operators ?? 0}op · {s?.auto ?? "manual"}</tspan>
                  </text>
                  {/* throughput + changeover */}
                  <text x={p.x + 12} y={p.y + 48} fontSize={9.5} fill={TEXTD}>
                    {step ? <tspan fill={TEXT}>{step.rate.toLocaleString()}/sh</tspan> : <tspan>—</tspan>}
                    {units > 1 ? <tspan fill={TEAL}> · ×{units} lanes</tspan> : null}
                    {(s?.changeoverMin ?? 0) > 0 ? <tspan> · c/o {s?.changeoverMin}m</tspan> : null}
                  </text>
                  {/* utilisation bar */}
                  {util != null ? (
                    <>
                      <rect x={p.x + 12} y={p.y + 56} width={barW} height={5} rx={2.5} fill={LINE} />
                      <rect x={p.x + 12} y={p.y + 56} width={(barW * util) / 100} height={5} rx={2.5} fill={isBn ? RED : util >= 90 ? AMBER : TEAL} />
                      <text x={p.x + NODE_W - 8} y={p.y + 74} fontSize={8.5} fill={TEXTD} textAnchor="end">{util}% util</text>
                    </>
                  ) : null}
                  {/* problem flag */}
                  {isBn ? (
                    <text x={p.x + 12} y={p.y + 74} fontSize={9} fontWeight={700} fill={RED}>⚠ BOTTLENECK</text>
                  ) : nearLimit ? (
                    <text x={p.x + 12} y={p.y + 74} fontSize={9} fontWeight={700} fill={AMBER}>▲ near limit {util}%</text>
                  ) : highScrap ? (
                    <text x={p.x + 12} y={p.y + 74} fontSize={9} fontWeight={700} fill={AMBER}>⚠ scrap {Math.round(scrap * 100)}%</text>
                  ) : null}
                </>
              ) : (
                <>
                  <text x={p.x + 12} y={p.y + 34} fontSize={9.5} fill={TEXTD}>{n.role}{flowFn ? " · holds WIP" : ""}</text>
                  {s && s.capacityPerShift > 0 ? <text x={p.x + 12} y={p.y + 48} fontSize={9.5} fill={TEXTD}><tspan fill={TEXT}>{s.capacityPerShift.toLocaleString()}/sh</tspan> capacity</text> : null}
                </>
              )}

              {assemble[n.id] ? <text x={p.x + NODE_W - 8} y={p.y + 34} fill={AMBER} fontSize={11} textAnchor="end">⋈</text> : null}
              {/* in (left) / out (right) ports */}
              <circle cx={p.x} cy={p.y + NODE_H / 2} r={3.5} fill={TEAL} />
              <circle cx={p.x + NODE_W} cy={p.y + NODE_H / 2} r={3.5} fill={AMBER} />
              {/* scrap stub */}
              {scrap > 0 ? (
                <line x1={p.x + NODE_W / 2} y1={p.y + NODE_H} x2={p.x + NODE_W / 2} y2={p.y + NODE_H + 14} stroke={RED} strokeWidth={1.3} strokeDasharray="3 2" markerEnd="url(#dag-arrow)" />
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span>columns = process layers</span>
        <span><span style={{ color: RED }}>⚠</span> bottleneck · <span style={{ color: AMBER }}>▲</span> near limit · <span style={{ color: AMBER }}>⚠</span> scrap</span>
        <span><span style={{ color: TEAL }}>●</span> in <span style={{ color: AMBER }}>●</span> out · bar = utilisation</span>
        <span style={{ color: RED }}>┅ scrap / back-edge</span>
      </div>
      <div className="hint" style={{ borderTop: "1px solid " + LINE, paddingTop: 8 }}>
        {balance ? (
          <>
            {dag.layers} layer(s) · takt {takt > 0 ? fmtSec(takt) : "—"} · line {balance.lineOut.toLocaleString()}/sh
            {balance.bottleneck ? <> · bottleneck <span style={{ color: RED }}>{balance.bottleneck.name}</span></> : null} · click a node to configure it.
          </>
        ) : (
          <>{dag.layers} layer(s) · click a node to configure it.</>
        )}
      </div>
    </div>
  );
}
