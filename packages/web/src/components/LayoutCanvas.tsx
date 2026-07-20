import { useCallback, useEffect, useRef, useState } from "react";
import type { Flow, Model, NoGoZone, Station } from "@flowplan/core/model/types";
import type { ChainResult } from "@flowplan/core/engine/automation";
import type { Slot } from "@flowplan/core/engine/templates";
import type { ProposalItem } from "@flowplan/core/engine/proposal";
import type { Side } from "@flowplan/core/model/types";
import { center, clampToGrid, hasCollision, portPoint, stationCells } from "@flowplan/core/engine/geometry";
import { AMBER, AUTO_COL, ERGO_COL, LINE, PANEL2, RED, TEAL, TEALD, TEXT, TEXTD, TYPE_COL } from "./colors";

const PAD = 12;

// Outline of a freeform footprint: stroke only the cell edges that border empty
// space, so there are no internal grid lines (no contour tracing needed).
function footprintBoundary(cells: Array<{ x: number; y: number }>, cell: number): string {
  const set = new Set(cells.map((c) => c.x + "," + c.y));
  const X = (gx: number) => PAD + gx * cell;
  const Y = (gy: number) => PAD + gy * cell;
  let d = "";
  for (const c of cells) {
    if (!set.has(c.x + "," + (c.y - 1))) d += `M${X(c.x)} ${Y(c.y)}L${X(c.x + 1)} ${Y(c.y)}`;
    if (!set.has(c.x + "," + (c.y + 1))) d += `M${X(c.x)} ${Y(c.y + 1)}L${X(c.x + 1)} ${Y(c.y + 1)}`;
    if (!set.has(c.x - 1 + "," + c.y)) d += `M${X(c.x)} ${Y(c.y)}L${X(c.x)} ${Y(c.y + 1)}`;
    if (!set.has(c.x + 1 + "," + c.y)) d += `M${X(c.x + 1)} ${Y(c.y)}L${X(c.x + 1)} ${Y(c.y + 1)}`;
  }
  return d;
}

function stubDir(side: Side): { dx: number; dy: number } {
  return side === "left" ? { dx: -1, dy: 0 } : side === "right" ? { dx: 1, dy: 0 } : side === "top" ? { dx: 0, dy: -1 } : { dx: 0, dy: 1 };
}

export type CanvasMode = "select" | "flow" | "nogo";

interface Props {
  model: Model;
  stations: Station[];
  flows: Flow[];
  chain?: ChainResult;
  ghost?: Station[];
  /** Solver moves behind the ghosts (spec §4). Makes each ghost acceptable in place. */
  proposalItems?: ProposalItem[];
  /** Accept ONE move — the ghost is the button (Law 1: click the thing itself). */
  onAcceptMove?: (stationId: string) => void;
  template?: Slot[] | null;
  selId?: string | null;
  label: string;
  badge: string;
  cell: number;
  interactive?: boolean;
  mode?: CanvasMode;
  flowFirst?: string | null;
  selFlow?: { from: string; to: string } | null;
  criticalPath?: string[];
  onSelect?: (id: string | null) => void;
  onSelectFlow?: (f: { from: string; to: string } | null) => void;
  onHoverStation?: (s: Station | null, clientX: number, clientY: number) => void;
  onMoveStart?: () => void;
  onMove?: (id: string, x: number, y: number) => void;
  onPickStation?: (id: string) => void;
  onAddNoGo?: (zone: NoGoZone) => void;
  /** Drag-to-wire: dragging from a station's OUT port to another station
   *  creates a flow (node-RED-style wiring, spec Law 2 — feedback during the
   *  gesture). Only offered when interactive. */
  onWire?: (from: string, to: string) => void;
}

export function LayoutCanvas(props: Props) {
  const { model, stations, flows, chain, ghost, proposalItems, onAcceptMove, template, selId, label, badge, cell, interactive } = props;
  const mode: CanvasMode = props.mode ?? "select";
  const svgRef = useRef<SVGSVGElement | null>(null);
  const baseW = model.gridW * cell + PAD * 2;
  const baseH = model.gridH * cell + PAD * 2;

  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ id: string | null; pan: boolean; nogo: { x: number; y: number } | null; wireFrom: string | null }>({
    id: null,
    pan: false,
    nogo: null,
    wireFrom: null,
  });
  const [nogoRect, setNogoRect] = useState<NoGoZone | null>(null);
  const [wireEnd, setWireEnd] = useState<{ from: string; x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverGhost, setHoverGhost] = useState<string | null>(null);
  const [dragCollide, setDragCollide] = useState(false);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const vbW = baseW / zoom;
  const vbH = baseH / zoom;

  // Client coords -> SVG user coords (accounts for viewBox + responsive scale).
  const toSvg = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }, []);
  const toGrid = useCallback(
    (cx: number, cy: number) => {
      const p = toSvg(cx, cy);
      return { x: (p.x - PAD) / cell, y: (p.y - PAD) / cell };
    },
    [toSvg, cell],
  );

  // Global pointer handlers while interacting.
  useEffect(() => {
    if (!interactive) return;
    function moveHandler(e: PointerEvent) {
      const d = dragRef.current;
      if (d.wireFrom) {
        const p = toSvg(e.clientX, e.clientY);
        setWireEnd({ from: d.wireFrom, x: p.x, y: p.y });
        return;
      }
      if (d.id && props.onMove) {
        const g = toGrid(e.clientX, e.clientY);
        const s = stations.find((x) => x.id === d.id);
        if (s) {
          const nx = Math.round(g.x - s.w / 2);
          const ny = Math.round(g.y - s.h / 2);
          props.onMove(d.id, nx, ny);
          const p = clampToGrid(s, nx, ny, model.gridW, model.gridH);
          setDragCollide(hasCollision(s, p.x, p.y, stations, model.noGoZones));
        }
      } else if (d.pan && panStart.current) {
        const ps = panStart.current;
        const k = vbW / (svgRef.current?.getBoundingClientRect().width || baseW);
        setOff({ x: ps.ox - (e.clientX - ps.x) * k, y: ps.oy - (e.clientY - ps.y) * k });
      } else if (d.nogo) {
        const g = toGrid(e.clientX, e.clientY);
        const x0 = Math.min(d.nogo.x, g.x);
        const y0 = Math.min(d.nogo.y, g.y);
        setNogoRect({
          x: Math.max(0, Math.round(x0)),
          y: Math.max(0, Math.round(y0)),
          w: Math.max(1, Math.round(Math.abs(g.x - d.nogo.x))),
          h: Math.max(1, Math.round(Math.abs(g.y - d.nogo.y))),
        });
      }
    }
    function upHandler(e: PointerEvent) {
      const d = dragRef.current;
      if (d.nogo && nogoRect && props.onAddNoGo) props.onAddNoGo(nogoRect);
      if (d.wireFrom && props.onWire) {
        const g = toGrid(e.clientX, e.clientY);
        const target = stations.find(
          (s) => g.x >= s.x && g.x <= s.x + s.w && g.y >= s.y && g.y <= s.y + s.h,
        );
        if (target && target.id !== d.wireFrom) props.onWire(d.wireFrom, target.id);
      }
      dragRef.current = { id: null, pan: false, nogo: null, wireFrom: null };
      panStart.current = null;
      setNogoRect(null);
      setWireEnd(null);
      setDraggingId(null);
      setDragCollide(false);
    }
    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler);
    return () => {
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", upHandler);
    };
  }, [interactive, props, stations, toGrid, toSvg, vbW, baseW, nogoRect]);

  function onBackgroundDown(e: React.PointerEvent) {
    if (!interactive) return;
    if (mode === "nogo") {
      const g = toGrid(e.clientX, e.clientY);
      dragRef.current = { id: null, pan: false, nogo: { x: g.x, y: g.y }, wireFrom: null };
    } else {
      props.onSelect?.(null);
      dragRef.current = { id: null, pan: true, nogo: null, wireFrom: null };
      panStart.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
    }
  }

  function onStationDown(e: React.PointerEvent, s: Station) {
    e.stopPropagation();
    if (mode === "flow") {
      props.onPickStation?.(s.id);
      return;
    }
    props.onSelect?.(s.id);
    if (interactive && !s.fixed && props.onMove) {
      props.onMoveStart?.();
      dragRef.current = { id: s.id, pan: false, nogo: null, wireFrom: null };
      setDraggingId(s.id);
      setDragCollide(false);
    }
  }

  function onWheel(e: React.WheelEvent) {
    if (!interactive) return;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((z) => Math.max(0.5, Math.min(4, z * factor)));
  }

  const byId: Record<string, Station> = {};
  stations.forEach((s) => (byId[s.id] = s));
  const linkKind: Record<string, string> = {};
  (chain?.links ?? []).forEach((l) => (linkKind[l.from + ">" + l.to] = l.kind));
  const cp = props.criticalPath ?? [];
  const cpEdges = new Set<string>();
  const cpNodes = new Set(cp);
  for (let i = 0; i < cp.length - 1; i++) cpEdges.add(cp[i] + ">" + cp[i + 1]);

  const gridLines = [];
  for (let i = 0; i <= model.gridW; i++)
    gridLines.push(
      <line key={"v" + i} x1={PAD + i * cell} y1={PAD} x2={PAD + i * cell} y2={PAD + model.gridH * cell} stroke={LINE} strokeWidth={0.5} opacity={0.5} />,
    );
  for (let j = 0; j <= model.gridH; j++)
    gridLines.push(
      <line key={"h" + j} x1={PAD} y1={PAD + j * cell} x2={PAD + model.gridW * cell} y2={PAD + j * cell} stroke={LINE} strokeWidth={0.5} opacity={0.5} />,
    );

  return (
    <div>
      <div className="layoutTitle" style={{ color: badge }}>
        {label}
        {interactive && zoom !== 1 ? (
          <button className="btn sm" style={{ marginLeft: 10 }} onClick={() => { setZoom(1); setOff({ x: 0, y: 0 }); }}>
            reset zoom
          </button>
        ) : null}
      </div>
      <svg
        ref={svgRef}
        viewBox={`${off.x} ${off.y} ${vbW} ${vbH}`}
        width={baseW}
        height={baseH}
        data-layout={label}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
      >
        <defs>
          <marker id="fp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        {/* background catcher for pan / no-go draw / deselect */}
        <rect x={off.x} y={off.y} width={vbW} height={vbH} fill="transparent" onPointerDown={onBackgroundDown} style={{ cursor: mode === "nogo" ? "crosshair" : interactive ? "grab" : "default" }} />
        {gridLines}

        {(template ?? []).map((t, i) => (
          <g key={"t" + i}>
            <rect x={PAD + t.x * cell} y={PAD + t.y * cell} width={3 * cell} height={2.5 * cell} fill="none" stroke={AMBER} strokeDasharray="3 3" strokeWidth={1} rx={4} opacity={0.5} />
            <text x={PAD + (t.x + 1.5) * cell} y={PAD + (t.y + 1.25) * cell} fill={AMBER} opacity={0.6} fontSize={11} textAnchor="middle" dominantBaseline="middle">
              {i + 1}
            </text>
          </g>
        ))}

        {(model.noGoZones ?? []).map((z, i) => (
          <rect key={"z" + i} x={PAD + z.x * cell} y={PAD + z.y * cell} width={z.w * cell} height={z.h * cell} fill={RED} opacity={0.08} stroke={RED} strokeWidth={1} strokeDasharray="4 3" />
        ))}
        {nogoRect ? (
          <rect x={PAD + nogoRect.x * cell} y={PAD + nogoRect.y * cell} width={nogoRect.w * cell} height={nogoRect.h * cell} fill={RED} opacity={0.18} stroke={RED} strokeWidth={1.5} />
        ) : null}

        {flows.map((f, i) => {
          const a = byId[f.from];
          const b = byId[f.to];
          if (!a || !b) return null;
          const op = portPoint(a, a.outSide ?? "right");
          const ip = portPoint(b, b.inSide ?? "left");
          const w = 0.5 + (f.volume / 1200) * 3;
          const k = linkKind[f.from + ">" + f.to];
          const onCp = cpEdges.has(f.from + ">" + f.to);
          const col = onCp ? TEAL : k === "auto-island" ? RED : k === "chained-auto" ? TEAL : k === "mixed" ? AMBER : badge;
          const dash = k === "manual" || k === "mixed" ? "5 4" : undefined;
          const sel = props.selFlow && props.selFlow.from === f.from && props.selFlow.to === f.to;
          const x1 = PAD + op.x * cell;
          const y1 = PAD + op.y * cell;
          const x2 = PAD + ip.x * cell;
          const y2 = PAD + ip.y * cell;
          return (
            <g key={"f" + i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={sel ? TEXT : col} strokeWidth={sel ? w + 1.5 : onCp ? w + 1 : w} opacity={onCp ? 0.95 : k ? 0.75 : 0.45} strokeDasharray={dash} markerEnd="url(#fp-arrow)" />
              {interactive && props.onSelectFlow ? (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    props.onSelectFlow?.({ from: f.from, to: f.to });
                  }}
                />
              ) : null}
            </g>
          );
        })}

        {/* Live wire being dragged from an OUT port (Law 2: feedback during the
            gesture). */}
        {wireEnd
          ? (() => {
              const src = byId[wireEnd.from];
              if (!src) return null;
              const sp = portPoint(src, src.outSide ?? "right");
              return (
                <line
                  x1={PAD + sp.x * cell}
                  y1={PAD + sp.y * cell}
                  x2={wireEnd.x}
                  y2={wireEnd.y}
                  stroke={TEAL}
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                  markerEnd="url(#fp-arrow)"
                  pointerEvents="none"
                />
              );
            })()
          : null}

        {/*
          Ghost previews (spec §2 "ghost preview before commit"). When proposal
          items are supplied each ghost becomes its own accept target — Law 1,
          confirmation by clicking the thing itself, and Law 5, the decision
          lives on the canvas rather than in a table beside it. Hovering shows
          the mechanism, not just the verdict (Law 6).
        */}
        {(ghost ?? []).map((s) => {
          const cur = byId[s.id];
          if (!cur || (cur.x === s.x && cur.y === s.y)) return null;
          const item = proposalItems?.find((i) => i.stationId === s.id);
          const live = Boolean(item && onAcceptMove);
          const hot = hoverGhost === s.id;
          const gx = PAD + s.x * cell;
          const gy = PAD + s.y * cell;
          const gw = s.w * cell;
          const gh = s.h * cell;
          return (
            <g key={"g" + s.id}>
              <line x1={PAD + center(cur).x * cell} y1={PAD + center(cur).y * cell} x2={PAD + center(s).x * cell} y2={PAD + center(s).y * cell} stroke={AMBER} strokeWidth={hot ? 1.8 : 1} strokeDasharray="2 3" opacity={hot ? 0.95 : 0.6} />
              <rect x={gx} y={gy} width={gw} height={gh} fill={hot ? "rgba(224,164,88,.16)" : "none"} stroke={AMBER} strokeWidth={hot ? 2.4 : 1.5} strokeDasharray="5 4" rx={4} opacity={0.85} />
              {live && hot ? <rect x={gx} y={gy} width={gw} height={gh} fill="rgba(224,164,88,.10)" rx={4} pointerEvents="none" /> : null}
            </g>
          );
        })}

        {/* Hover readout for the focused ghost. In-canvas, never a dialog (Law 1). */}
        {(() => {
          const s = (ghost ?? []).find((g) => g.id === hoverGhost);
          const item = proposalItems?.find((i) => i.stationId === hoverGhost);
          if (!s || !item) return null;
          const gx = PAD + s.x * cell;
          const gy = PAD + s.y * cell;
          const w = Math.max(150, item.rationale.length * 4.6);
          const x = Math.min(Math.max(PAD, gx + s.w * cell / 2 - w / 2), model.gridW * cell + PAD - w);
          const y = gy - 30 < PAD ? gy + s.h * cell + 8 : gy - 30;
          return (
            <g pointerEvents="none">
              <rect x={x} y={y} width={w} height={24} rx={3} fill="rgba(10,18,20,.94)" stroke={AMBER} strokeWidth={0.8} />
              <text x={x + 7} y={y + 15} fontSize={9.5} fill={TEXT}>{item.rationale}</text>
            </g>
          );
        })()}

        {stations.map((s) => {
          const seld = selId === s.id;
          const picked = props.flowFirst === s.id;
          const colliding = draggingId === s.id && dragCollide;
          const onCpNode = cpNodes.has(s.id);
          const units = Math.max(1, s.parallelUnits ?? 1);
          const assemble = (s.mergeMode ?? "sum") === "assemble" && flows.filter((f) => f.to === s.id).length > 1;
          const roleStroke = s.role === "input" ? TEAL : s.role === "output" ? AMBER : null;
          const outline = colliding ? RED : picked || seld ? TEAL : onCpNode ? TEAL : s.fixed ? AMBER : roleStroke ?? TEALD;
          const strokeW = picked || seld || colliding || onCpNode ? 2 : 1.2;
          const fillCol = colliding ? "#3a1f1c" : TYPE_COL[s.type] || PANEL2;
          const shaped = !!(s.cells && s.cells.length);
          const occ = shaped ? stationCells(s) : [];
          const inS = s.inSide ?? "left";
          const outS = s.outSide ?? "right";
          const scrapS = s.scrapSide ?? "bottom";
          const scrap = Math.max(0, Math.min(1, s.scrapRate ?? 0));
          const ip = portPoint(s, inS);
          const op = portPoint(s, outS);
          const spn = portPoint(s, scrapS);
          const sdir = stubDir(scrapS);
          return (
            <g
              key={s.id}
              style={{ cursor: mode === "flow" ? "crosshair" : interactive ? (s.fixed ? "not-allowed" : "grab") : "pointer" }}
              onPointerDown={(e) => onStationDown(e, s)}
              onPointerEnter={(e) => props.onHoverStation?.(s, e.clientX, e.clientY)}
              onPointerLeave={() => props.onHoverStation?.(null, 0, 0)}
            >
              {/* stacked shadow implies parallel lanes */}
              {units > 1 && !shaped ? (
                <>
                  <rect x={PAD + s.x * cell + 5} y={PAD + s.y * cell + 5} width={s.w * cell} height={s.h * cell} rx={5} fill={PANEL2} stroke={TEALD} strokeWidth={1} opacity={0.6} />
                  <rect x={PAD + s.x * cell + 2.5} y={PAD + s.y * cell + 2.5} width={s.w * cell} height={s.h * cell} rx={5} fill={PANEL2} stroke={TEALD} strokeWidth={1} opacity={0.8} />
                </>
              ) : null}
              {shaped ? (
                <>
                  {occ.map((c, i) => (
                    <rect key={"c" + i} x={PAD + c.x * cell} y={PAD + c.y * cell} width={cell} height={cell} fill={fillCol} />
                  ))}
                  <path d={footprintBoundary(occ, cell)} fill="none" stroke={outline} strokeWidth={strokeW} strokeLinejoin="round" />
                </>
              ) : (
                <>
                  <rect x={PAD + s.x * cell} y={PAD + s.y * cell} width={s.w * cell} height={s.h * cell} rx={5} fill={fillCol} stroke={outline} strokeWidth={strokeW} />
                  {roleStroke ? <rect x={PAD + s.x * cell + 1} y={PAD + s.y * cell + 1} width={s.w * cell - 2} height={s.h * cell - 2} rx={4} fill="none" stroke={roleStroke} strokeWidth={1} strokeDasharray="2 2" opacity={0.7} /> : null}
                </>
              )}
              {units > 1 ? (
                <text x={PAD + s.x * cell + 5} y={PAD + (s.y + s.h) * cell - 5} fill={TEAL} fontSize={9} fontWeight={700} style={{ pointerEvents: "none" }}>
                  ×{units}
                </text>
              ) : null}
              {assemble ? (
                <text x={PAD + ip.x * cell + 6} y={PAD + ip.y * cell - 5} fill={AMBER} fontSize={10} style={{ pointerEvents: "none" }}>
                  ⋈
                </text>
              ) : null}
              <circle cx={PAD + s.x * cell + 7} cy={PAD + s.y * cell + 7} r={3} fill={ERGO_COL[s.ergoRisk] || TEXTD} />
              <circle cx={PAD + (s.x + s.w) * cell - 7} cy={PAD + s.y * cell + 7} r={3} fill={AUTO_COL[s.auto] || TEXTD} />
              {/* scrap-out port + dashed stub when this step scraps parts */}
              {scrap > 0 ? (
                <g style={{ pointerEvents: "none" }}>
                  <line x1={PAD + spn.x * cell} y1={PAD + spn.y * cell} x2={PAD + (spn.x + sdir.dx * 0.7) * cell} y2={PAD + (spn.y + sdir.dy * 0.7) * cell} stroke={RED} strokeWidth={1.2} strokeDasharray="3 2" markerEnd="url(#fp-arrow)" />
                  <text x={PAD + (spn.x + sdir.dx * 0.9) * cell} y={PAD + (spn.y + sdir.dy * 0.9) * cell} fill={RED} fontSize={7} textAnchor="middle" dominantBaseline="middle">
                    {Math.round(scrap * 100)}%
                  </text>
                </g>
              ) : null}
              {/* IN (teal) and OUT (amber) ports */}
              <circle cx={PAD + ip.x * cell} cy={PAD + ip.y * cell} r={3.2} fill={TEAL} stroke="#0e1416" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
              <circle cx={PAD + op.x * cell} cy={PAD + op.y * cell} r={3.2} fill={AMBER} stroke="#0e1416" strokeWidth={0.8} style={{ pointerEvents: "none" }} />
              {/* Drag-to-wire handle over the OUT port (node-RED-style). A larger
                  transparent hit target so the 3px port is easy to grab. */}
              {interactive && props.onWire && mode === "select" ? (
                <circle
                  data-outport={s.id}
                  cx={PAD + op.x * cell}
                  cy={PAD + op.y * cell}
                  r={7}
                  fill="transparent"
                  style={{ cursor: "crosshair" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    dragRef.current = { id: null, pan: false, nogo: null, wireFrom: s.id };
                    const p = toSvg(e.clientX, e.clientY);
                    setWireEnd({ from: s.id, x: p.x, y: p.y });
                  }}
                >
                  <title>Drag to another station to connect a flow</title>
                </circle>
              ) : null}
              <text x={PAD + (s.x + s.w / 2) * cell} y={PAD + (s.y + s.h / 2) * cell - 5} fill={TEXT} fontSize={10} fontWeight={600} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none", fontFamily: "'IBM Plex Sans',sans-serif" }}>
                {s.name}
              </text>
              <text x={PAD + (s.x + s.w / 2) * cell} y={PAD + (s.y + s.h / 2) * cell + 7} fill={s.fixed ? AMBER : TEXTD} fontSize={7.5} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none" }}>
                {s.role !== "process" ? s.role.toUpperCase() : s.auto + " · " + s.operators + "op"}
              </text>
            </g>
          );
        })}

        {/*
          Accept affordances, rendered LAST so they sit above the stations.
          They are deliberately small ✓ badges rather than a full-size rect over
          the ghost: a ghost frequently overlaps a real station (two stations
          swapping is the common proposal), and a full-rect target would both
          be intercepted by the station and swallow drags on it. A dedicated
          badge keeps Law 1 (click the thing itself) without breaking Law 4.
        */}
        {onAcceptMove
          ? (ghost ?? []).map((s) => {
              const cur = byId[s.id];
              if (!cur || (cur.x === s.x && cur.y === s.y)) return null;
              const item = proposalItems?.find((i) => i.stationId === s.id);
              if (!item) return null;
              const hot = hoverGhost === s.id;
              const bx = PAD + s.x * cell + s.w * cell - 9;
              const by = PAD + s.y * cell + 9;
              return (
                <g
                  key={"acc" + s.id}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoverGhost(s.id)}
                  onMouseLeave={() => setHoverGhost((h) => (h === s.id ? null : h))}
                  onClick={(e) => { e.stopPropagation(); setHoverGhost(null); onAcceptMove(s.id); }}
                >
                  <title>{`${item.rationale} — click to accept this move`}</title>
                  <circle cx={bx} cy={by} r={hot ? 9 : 7.5} fill={hot ? AMBER : "rgba(14,20,22,.85)"} stroke={AMBER} strokeWidth={1.2} />
                  <path
                    d={`M ${bx - 3.6} ${by} l 2.4 2.6 l 5 -5.4`}
                    fill="none" stroke={hot ? "#1a1205" : AMBER} strokeWidth={1.8}
                    strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"
                  />
                </g>
              );
            })
          : null}
      </svg>
    </div>
  );
}
