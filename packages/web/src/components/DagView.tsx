import type { Model } from "@flowplan/core/model/types";
import { isFlowFunction, partsPerCycleOf } from "@flowplan/core/model/types";
import type { ChainResult } from "@flowplan/core/engine/automation";
import type { BalanceResult } from "@flowplan/core/engine/balance";
import { effectiveCycleSec } from "@flowplan/core/engine/cycle";
import { dagLayout } from "@flowplan/core/engine/dag";
import { AMBER, LINE, PANEL2, RED, TEAL, TEALD, TEXT, TEXTD, TYPE_COL } from "./colors";

// Process flow as a layered DAG, drawn TOP-TO-BOTTOM so the chain runs down the
// page and can use the full height of the view. Each node is a data card that
// carries the step's times and meta (cycle/part, operators, automation,
// throughput, utilisation), and the analysis is drawn ON the graph: the
// bottleneck, near-limit and high-scrap steps are flagged so the DAG is a place
// to *read* the line, not just its shape. Cards render at a fixed, legible size
// (no down-scaling), and the container scrolls when the flow is longer/wider
// than the viewport.
const NODE_W = 340;
const NODE_H = 150;
const COL_GAP = NODE_W + 56; // horizontal step between parallel branches
const ROW_GAP = NODE_H + 64; // vertical step between successive layers
const PAD = 20;

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

  // Vertical layout: layer → row (down the page), row → column (across).
  const pos: Record<string, { x: number; y: number }> = {};
  dag.nodes.forEach((n) => {
    pos[n.id] = { x: PAD + n.row * COL_GAP, y: PAD + n.layer * ROW_GAP };
  });
  const maxRows = Math.max(1, ...dag.rowsPerLayer);
  const W = PAD * 2 + (maxRows - 1) * COL_GAP + NODE_W;
  const H = PAD * 2 + Math.max(0, dag.layers - 1) * ROW_GAP + NODE_H;

  const edgeColor = (k?: string) => (k === "auto-island" ? RED : k === "chained-auto" ? TEAL : k === "mixed" ? AMBER : TEXTD);

  return (
    <div className="dag-view">
      <div className="dag-view__head">
        <h4 className="dag-view__title">Process DAG</h4>
        <p className="dag-view__caption">
          {balance ? (
            <>
              {dag.layers} layer{dag.layers === 1 ? "" : "s"} · takt {takt > 0 ? fmtSec(takt) : "—"} · line{" "}
              {balance.lineOut.toLocaleString()}/shift
              {balance.bottleneck ? (
                <>
                  {" "}
                  · bottleneck <span style={{ color: RED, fontWeight: 600 }}>{balance.bottleneck.name}</span>
                </>
              ) : null}
            </>
          ) : (
            <>
              {dag.layers} layer{dag.layers === 1 ? "" : "s"}
            </>
          )}
          {" · click a card to configure it"}
        </p>
      </div>

      {dag.hasCycle ? (
        <div className="dag-view__cycle">
          <span style={{ color: RED }}>● </span>
          This flow contains a cycle — highlighted edges loop backward, so the process is not a true DAG. Remove a
          back-edge to make it acyclic.
        </div>
      ) : null}

      <div className="dag-view__scroll">
        <svg className="dag-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Process flow as a directed acyclic graph">
          <defs>
            <marker id="dag-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {dag.edges.map((e, i) => {
            const a = pos[e.from];
            const b = pos[e.to];
            if (!a || !b) return null;
            // Ports are top (in) / bottom (out); the flow runs downward.
            const x1 = a.x + NODE_W / 2;
            const y1 = a.y + NODE_H;
            const x2 = b.x + NODE_W / 2;
            const y2 = b.y;
            const onCp = cpEdges.has(e.from + ">" + e.to);
            const col = e.back ? RED : onCp ? TEAL : edgeColor(kind[e.from + ">" + e.to]);
            const midY = (y1 + y2) / 2;
            const d = e.back
              ? `M${x1} ${y1} C ${x1 + 70} ${y1 + 40}, ${x2 + 70} ${y2 - 40}, ${x2} ${y2}`
              : `M${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
            const wdt = (1.4 + Math.min(2.2, (e.volume / 1200) * 1.6)) * (onCp ? 1.5 : 1);
            const sl = shareLabel(e.from, e.to);
            return (
              <g key={"e" + i}>
                <path d={d} fill="none" stroke={col} strokeWidth={wdt} strokeDasharray={e.back ? "6 4" : undefined} opacity={onCp ? 1 : 0.8} markerEnd="url(#dag-arrow)" />
                {sl ? (
                  <text x={(x1 + x2) / 2 + 8} y={midY} fill={TEXTD} fontSize={12} dominantBaseline="middle">
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

            // Utilisation (process only). Rate already accounts for operators,
            // parallel lanes and parts/cycle, so it is the honest measure of how
            // close a step runs to its limit — not the raw cycle vs takt.
            const util = step ? Math.max(0, Math.min(100, step.util)) : null;
            const nearLimit = isProcess && !isBn && util != null && util >= 90;
            const highScrap = scrap >= 0.05;
            const problem = isBn || nearLimit || highScrap;

            const roleCol = n.role === "input" ? TEAL : n.role === "output" ? AMBER : TEALD;
            const border = isBn ? RED : sel || onCp ? TEAL : nearLimit || highScrap ? AMBER : roleCol;
            const typeCol = TYPE_COL[(s?.type ?? "machine") as keyof typeof TYPE_COL] ?? PANEL2;
            const barW = NODE_W - 32;
            const cx = p.x + NODE_W / 2;

            return (
              <g key={n.id} style={{ cursor: "pointer" }} onClick={() => onSelect(n.id)}>
                <rect
                  x={p.x}
                  y={p.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={4}
                  fill={PANEL2}
                  stroke={border}
                  strokeWidth={sel || onCp || problem ? 2.5 : 1.5}
                />
                {/* type accent strip on the left edge */}
                <rect x={p.x} y={p.y} width={5} height={NODE_H} rx={2.5} fill={typeCol} />

                {/* title */}
                <text x={p.x + 18} y={p.y + 28} fill={TEXT} fontSize={16} fontWeight={600} style={{ fontFamily: "'IBM Plex Sans',sans-serif" }}>
                  {n.name.length > 26 ? n.name.slice(0, 25) + "…" : n.name}
                </text>
                {/* type / role tag, right-aligned */}
                <text x={p.x + NODE_W - 16} y={p.y + 27} fill={TEXTD} fontSize={12} textAnchor="end">
                  {flowFn ? "buffer" : s?.type ?? n.role}
                </text>
                <line x1={p.x + 18} y1={p.y + 40} x2={p.x + NODE_W - 16} y2={p.y + 40} stroke={LINE} strokeWidth={1} />

                {isProcess ? (
                  <>
                    {/* times + manning */}
                    <text x={p.x + 18} y={p.y + 64} fontSize={13.5} fill={TEXTD}>
                      <tspan fill={TEXT} fontWeight={600}>{fmtSec(perPart)}/part</tspan>
                      {ppc > 1 ? <tspan fill={TEAL}> ×{ppc}</tspan> : null}
                      <tspan> · {s?.operators ?? 0} op · {s?.auto ?? "manual"}</tspan>
                    </text>
                    {/* throughput + changeover */}
                    <text x={p.x + 18} y={p.y + 86} fontSize={13.5} fill={TEXTD}>
                      {step ? <tspan fill={TEXT} fontWeight={600}>{step.rate.toLocaleString()}/shift</tspan> : <tspan>—</tspan>}
                      {units > 1 ? <tspan fill={TEAL}> · ×{units} lanes</tspan> : null}
                      {(s?.changeoverMin ?? 0) > 0 ? <tspan> · c/o {s?.changeoverMin} min</tspan> : null}
                    </text>
                    {/* utilisation bar */}
                    {util != null ? (
                      <>
                        <rect x={p.x + 18} y={p.y + 100} width={barW} height={8} rx={4} fill={LINE} />
                        <rect x={p.x + 18} y={p.y + 100} width={(barW * util) / 100} height={8} rx={4} fill={isBn ? RED : util >= 90 ? AMBER : TEAL} />
                        <text x={p.x + NODE_W - 16} y={p.y + 128} fontSize={12} fill={TEXTD} textAnchor="end">{util}% utilisation</text>
                      </>
                    ) : null}
                    {/* problem flag */}
                    {isBn ? (
                      <text x={p.x + 18} y={p.y + 130} fontSize={13} fontWeight={600} fill={RED}>⚠ Bottleneck</text>
                    ) : nearLimit ? (
                      <text x={p.x + 18} y={p.y + 130} fontSize={13} fontWeight={600} fill={AMBER}>▲ Near limit {util}%</text>
                    ) : highScrap ? (
                      <text x={p.x + 18} y={p.y + 130} fontSize={13} fontWeight={600} fill={AMBER}>⚠ Scrap {Math.round(scrap * 100)}%</text>
                    ) : (
                      <text x={p.x + 18} y={p.y + 130} fontSize={12.5} fill={TEAL}>✓ Within takt</text>
                    )}
                  </>
                ) : (
                  <>
                    <text x={p.x + 18} y={p.y + 66} fontSize={13.5} fill={TEXTD}>
                      {n.role}
                      {flowFn ? " · holds WIP" : ""}
                    </text>
                    {s && s.capacityPerShift > 0 ? (
                      <text x={p.x + 18} y={p.y + 90} fontSize={13.5} fill={TEXTD}>
                        <tspan fill={TEXT} fontWeight={600}>{s.capacityPerShift.toLocaleString()}/shift</tspan> capacity
                      </text>
                    ) : null}
                  </>
                )}

                {assemble[n.id] ? <text x={p.x + NODE_W - 16} y={p.y + NODE_H - 12} fill={AMBER} fontSize={15} textAnchor="end">⋈ assemble</text> : null}
                {/* in (top) / out (bottom) ports */}
                <circle cx={cx} cy={p.y} r={4} fill={TEAL} />
                <circle cx={cx} cy={p.y + NODE_H} r={4} fill={AMBER} />
                {/* scrap stub */}
                {scrap > 0 ? (
                  <line x1={p.x + NODE_W} y1={p.y + NODE_H / 2} x2={p.x + NODE_W + 18} y2={p.y + NODE_H / 2} stroke={RED} strokeWidth={1.4} strokeDasharray="3 2" markerEnd="url(#dag-arrow)" />
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="dag-view__legend">
        <span>
          <span style={{ color: RED }}>⚠</span> bottleneck
        </span>
        <span>
          <span style={{ color: AMBER }}>▲</span> near limit
        </span>
        <span>
          <span style={{ color: AMBER }}>⚠</span> scrap
        </span>
        <span>
          <span style={{ color: TEAL }}>●</span> in · <span style={{ color: AMBER }}>●</span> out
        </span>
        <span>bar = utilisation</span>
        <span style={{ color: RED }}>┅ scrap / back-edge</span>
      </div>
    </div>
  );
}
