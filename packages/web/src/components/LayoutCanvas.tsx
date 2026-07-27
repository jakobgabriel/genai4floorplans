import { IconBtn } from "./Btn";
import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, CenterToFit } from "@carbon/icons-react";
import type { Flow, Model, NoGoZone, Station, ZoneKind } from "@flowplan/core/model/types";
import type { ChainResult } from "@flowplan/core/engine/automation";
import type { Slot } from "@flowplan/core/engine/templates";
import type { ProposalItem } from "@flowplan/core/engine/proposal";
import type { Side } from "@flowplan/core/model/types";
import { center, clampToGrid, hasCollision, portPoint, stationCells } from "@flowplan/core/engine/geometry";
import { useAccents } from "./colors";
import { useT } from "../i18n";

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
  /** The kind the next drawn zone will be — colours the drag preview. */
  zoneKind?: ZoneKind;
}

export function LayoutCanvas(props: Props) {
  const t = useT();
  const { AMBER, AUTO_COL, BLUE, COLLIDE_COL, ERGO_COL, LINE, NOGO_COL, PANEL2, PORT_RING, RED, TEAL, TEALD, TEXT, TEXTD, TYPE_COL } = useAccents();
  // Each zone kind reads in its own colour; esd/cleanroom are overlays.
  const zoneColor: Record<ZoneKind, string> = { blocked: RED, pathway: AMBER, esd: BLUE, cleanroom: TEAL };
  const { model, stations, flows, chain, ghost, proposalItems, onAcceptMove, template, selId, label, badge, cell: cellProp, interactive } = props;
  const mode: CanvasMode = props.mode ?? "select";
  const svgRef = useRef<SVGSVGElement | null>(null);

  // The canvas fills the space it is given rather than being a fixed
  // gridW*cell rectangle floating in it. `cell` is now a density *hint*: the
  // measured stage decides the real cell size, so the plan grows to use the
  // window instead of leaving dead background to the right and below.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Unmeasured (first paint, and jsdom in tests) falls back to the old fixed
  // size, so nothing depends on layout having happened.
  const fitted = box
    ? Math.min((box.w - PAD * 2) / model.gridW, (box.h - PAD * 2) / model.gridH)
    : cellProp;
  const cell = Math.max(10, Math.min(80, fitted));
  const W = box ? box.w : model.gridW * cell + PAD * 2;
  const H = box ? box.h : model.gridH * cell + PAD * 2;
  const baseW = W;
  const baseH = H;

  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ id: string | null; pan: boolean; nogo: { x: number; y: number } | null }>({
    id: null,
    pan: false,
    nogo: null,
  });
  const [nogoRect, setNogoRect] = useState<NoGoZone | null>(null);
  // Mirror the drawn rect in a ref so the window pointerup handler always reads
  // the latest value — a fast drag can fire pointerup before React re-renders.
  const nogoRectRef = useRef<NoGoZone | null>(null);
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
        const rect = {
          x: Math.max(0, Math.round(x0)),
          y: Math.max(0, Math.round(y0)),
          w: Math.max(1, Math.round(Math.abs(g.x - d.nogo.x))),
          h: Math.max(1, Math.round(Math.abs(g.y - d.nogo.y))),
        };
        nogoRectRef.current = rect;
        setNogoRect(rect);
      }
    }
    function upHandler() {
      const d = dragRef.current;
      if (d.nogo && nogoRectRef.current && props.onAddNoGo) props.onAddNoGo(nogoRectRef.current);
      dragRef.current = { id: null, pan: false, nogo: null };
      panStart.current = null;
      nogoRectRef.current = null;
      setNogoRect(null);
      setDraggingId(null);
      setDragCollide(false);
    }
    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler);
    return () => {
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", upHandler);
    };
  }, [interactive, props, stations, toGrid, vbW, baseW]);

  function onBackgroundDown(e: React.PointerEvent) {
    if (!interactive) return;
    if (mode === "nogo") {
      const g = toGrid(e.clientX, e.clientY);
      dragRef.current = { id: null, pan: false, nogo: { x: g.x, y: g.y } };
    } else {
      props.onSelect?.(null);
      dragRef.current = { id: null, pan: true, nogo: null };
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
      dragRef.current = { id: s.id, pan: false, nogo: null };
      setDraggingId(s.id);
      setDragCollide(false);
    }
  }

  function onWheel(e: React.WheelEvent) {
    if (!interactive) return;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((z) => Math.max(0.5, Math.min(4, z * factor)));
  }

  const zoomBy = (factor: number) => setZoom((z) => Math.max(0.5, Math.min(4, z * factor)));

  // Reframe so every station and zone is in view, centred with a little margin.
  // With the unbounded canvas a step can be dragged out of sight — this brings
  // the whole layout back in one click, even when the floor is larger than the
  // stage (cell pinned at its minimum).
  function fitView() {
    if (!stations.length) {
      setZoom(1);
      setOff({ x: 0, y: 0 });
      return;
    }
    let minGX = Infinity, minGY = Infinity, maxGX = -Infinity, maxGY = -Infinity;
    for (const s of stations) {
      minGX = Math.min(minGX, s.x);
      minGY = Math.min(minGY, s.y);
      maxGX = Math.max(maxGX, s.x + s.w);
      maxGY = Math.max(maxGY, s.y + s.h);
    }
    for (const z of model.noGoZones ?? []) {
      minGX = Math.min(minGX, z.x);
      minGY = Math.min(minGY, z.y);
      maxGX = Math.max(maxGX, z.x + z.w);
      maxGY = Math.max(maxGY, z.y + z.h);
    }
    const minX = PAD + minGX * cell;
    const maxX = PAD + maxGX * cell;
    const minY = PAD + minGY * cell;
    const maxY = PAD + maxGY * cell;
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const margin = 1.15;
    const z = Math.max(0.5, Math.min(4, Math.min(baseW / (contentW * margin), baseH / (contentH * margin))));
    const nvbW = baseW / z;
    const nvbH = baseH / z;
    setZoom(z);
    setOff({ x: (minX + maxX) / 2 - nvbW / 2, y: (minY + maxY) / 2 - nvbH / 2 });
  }

  const byId: Record<string, Station> = {};
  stations.forEach((s) => (byId[s.id] = s));
  const linkKind: Record<string, string> = {};
  (chain?.links ?? []).forEach((l) => (linkKind[l.from + ">" + l.to] = l.kind));
  const cp = props.criticalPath ?? [];
  const cpEdges = new Set<string>();
  const cpNodes = new Set(cp);
  for (let i = 0; i < cp.length - 1; i++) cpEdges.add(cp[i] + ">" + cp[i + 1]);

  // The grid rules the whole visible surface, not just the gridW*gridH extent,
  // so panning and zooming never expose bare background. The floor rect below
  // is what marks where stations may actually be placed.
  const floorW = model.gridW * cell;
  const floorH = model.gridH * cell;
  const gridLines = [];
  {
    const i0 = Math.floor((off.x - PAD) / cell);
    const i1 = Math.ceil((off.x + vbW - PAD) / cell);
    const j0 = Math.floor((off.y - PAD) / cell);
    const j1 = Math.ceil((off.y + vbH - PAD) / cell);
    // Zoomed far out the extended grid would be thousands of lines; past that
    // it is visual mush anyway, so fall back to ruling the floor only.
    const tooDense = i1 - i0 > 400 || j1 - j0 > 400;
    const [a0, a1, b0, b1] = tooDense ? [0, model.gridW, 0, model.gridH] : [i0, i1, j0, j1];
    const y1 = tooDense ? PAD : off.y;
    const y2 = tooDense ? PAD + floorH : off.y + vbH;
    const x1 = tooDense ? PAD : off.x;
    const x2 = tooDense ? PAD + floorW : off.x + vbW;
    // Every 5th line is heavier, so distances on the floor can be read off the
    // grid instead of counted cell by cell.
    const major = (n: number) => n % 5 === 0;
    for (let i = a0; i <= a1; i++)
      gridLines.push(
        <line key={"v" + i} x1={PAD + i * cell} y1={y1} x2={PAD + i * cell} y2={y2}
          stroke={LINE} strokeWidth={major(i) ? 1 : 0.5} opacity={major(i) ? 1 : 0.6} />,
      );
    for (let j = b0; j <= b1; j++)
      gridLines.push(
        <line key={"h" + j} x1={x1} y1={PAD + j * cell} x2={x2} y2={PAD + j * cell}
          stroke={LINE} strokeWidth={major(j) ? 1 : 0.5} opacity={major(j) ? 1 : 0.6} />,
      );
  }

  // Metric axis. One cell is one metre, so the major gridlines (every 5) are
  // labelled in metres along a top and a left ruler that stay pinned to the
  // viewport edges as you pan. The two rulers meet at an "m" origin — the axis
  // cross. A halo (paint-order stroke) keeps the numbers legible over the grid.
  const axis: React.ReactElement[] = [];
  {
    const i0 = Math.floor((off.x - PAD) / cell);
    const i1 = Math.ceil((off.x + vbW - PAD) / cell);
    const j0 = Math.floor((off.y - PAD) / cell);
    const j1 = Math.ceil((off.y + vbH - PAD) / cell);
    const fs = 10;
    const halo = { paintOrder: "stroke" as const };
    const cornerX = off.x + 16;
    const cornerY = off.y + fs + 3;
    for (let i = Math.max(0, i0); i <= i1; i++) {
      if (i % 5 !== 0) continue;
      const x = PAD + i * cell;
      if (x < cornerX) continue; // clear of the origin "m"
      axis.push(
        <text key={"rx" + i} x={x} y={off.y + fs} textAnchor="middle" fontSize={fs} fill={TEXTD} stroke="var(--cds-layer-01)" strokeWidth={3} style={halo}>
          {i}
        </text>,
      );
    }
    for (let j = Math.max(0, j0); j <= j1; j++) {
      if (j % 5 !== 0) continue;
      const y = PAD + j * cell;
      if (y < cornerY) continue;
      axis.push(
        <text key={"ry" + j} x={off.x + 3} y={y} textAnchor="start" dominantBaseline="middle" fontSize={fs} fill={TEXTD} stroke="var(--cds-layer-01)" strokeWidth={3} style={halo}>
          {j}
        </text>,
      );
    }
    axis.push(
      <text key="axm" x={off.x + 3} y={off.y + fs} fontSize={fs} fontWeight={700} fill="var(--text-primary)" stroke="var(--cds-layer-01)" strokeWidth={3} style={halo}>
        m
      </text>,
    );
  }

  return (
    <div className="lc">
      <div className="layoutTitle" style={{ color: badge }}>
        {label}
      </div>
      <div className="lc__stage" ref={stageRef}>
      {interactive ? (
        <div className="lc__zoom" role="group" aria-label={t("canvas.zoom.group")}>
          <IconBtn size="compact" icon={ZoomOut} label={t("canvas.zoom.out")} tooltipPosition="top" onClick={() => zoomBy(1 / 1.15)} />
          <span className="lc__zoom-pct" aria-hidden="true">{Math.round(zoom * 100)}%</span>
          <IconBtn size="compact" icon={ZoomIn} label={t("canvas.zoom.in")} tooltipPosition="top" onClick={() => zoomBy(1.15)} />
          <IconBtn size="compact" icon={CenterToFit} label={t("canvas.zoom.fit")} tooltipPosition="top" onClick={fitView} />
        </div>
      ) : null}
      <svg
        ref={svgRef}
        className="lc__svg"
        viewBox={`${off.x} ${off.y} ${vbW} ${vbH}`}
        width={baseW}
        height={baseH}
        data-layout={label}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        role={interactive ? "group" : "img"}
        aria-label={
          `${label} layout — ${stations.length} station${stations.length === 1 ? "" : "s"}, ${flows.length} connection${flows.length === 1 ? "" : "s"}` +
          (interactive ? ". Tab to a station, then arrow keys move it, Enter selects, Delete removes." : "")
        }
      >
        <defs>
          <marker id="fp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        {/* background catcher for pan / no-go draw / deselect */}
        <rect x={off.x} y={off.y} width={vbW} height={vbH} fill="transparent" onPointerDown={onBackgroundDown} style={{ cursor: mode === "nogo" ? "crosshair" : interactive ? "grab" : "default" }} />
        {/* The floor and grid are decoration only — they sit above the catcher,
            so they must let pointer events fall through to it (otherwise pan /
            zone-draw / deselect never fire over the floor). The floor fills the
            whole viewport: the canvas is unbounded, so there is no "outside the
            floor" dead area to shade differently — it reads as one continuous
            gridded surface. */}
        <g style={{ pointerEvents: "none" }}>
          <rect x={off.x} y={off.y} width={vbW} height={vbH} fill="var(--cds-layer-01)" />
          {gridLines}
        </g>
        <g className="lc__axis" style={{ pointerEvents: "none" }}>{axis}</g>

        {(template ?? []).map((t, i) => (
          <g key={"t" + i}>
            <rect x={PAD + t.x * cell} y={PAD + t.y * cell} width={3 * cell} height={2.5 * cell} fill="none" stroke={AMBER} strokeDasharray="3 3" strokeWidth={1} rx={4} opacity={0.5} />
            <text x={PAD + (t.x + 1.5) * cell} y={PAD + (t.y + 1.25) * cell} fill={AMBER} opacity={0.6} fontSize={11} textAnchor="middle" dominantBaseline="middle">
              {i + 1}
            </text>
          </g>
        ))}

        {(model.noGoZones ?? []).map((z, i) => {
          const zc = zoneColor[z.kind ?? "blocked"];
          return (
            <g key={"z" + i}>
              <rect x={PAD + z.x * cell} y={PAD + z.y * cell} width={z.w * cell} height={z.h * cell} fill={zc} opacity={0.1} stroke={zc} strokeWidth={1} strokeDasharray="4 3" />
              {cell > 22 ? (
                <text x={PAD + z.x * cell + 4} y={PAD + z.y * cell + 12} fill={zc} fontSize={9} style={{ pointerEvents: "none", textTransform: "uppercase" }}>
                  {z.kind ?? "blocked"}
                </text>
              ) : null}
            </g>
          );
        })}
        {nogoRect ? (
          <rect x={PAD + nogoRect.x * cell} y={PAD + nogoRect.y * cell} width={nogoRect.w * cell} height={nogoRect.h * cell} fill={zoneColor[props.zoneKind ?? "blocked"]} opacity={0.2} stroke={zoneColor[props.zoneKind ?? "blocked"]} strokeWidth={1.5} />
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
          const fillCol = colliding ? COLLIDE_COL : TYPE_COL[s.type] || PANEL2;
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
              // Addressable from outside: the walkthrough drags one of these to
              // prove the layout is still editable by hand, and there was no
              // stable handle on a station to grab.
              data-station-id={s.id}
              data-station-x={s.x}
              data-station-y={s.y}
              // Keyboard-reachable: the canvas was mouse-only, so a station
              // could be neither selected nor moved without a pointer. Focusing
              // selects (in select mode) so the arrow-key move already wired in
              // App acts on it; Enter/Space activates for flow-drawing too.
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? "button" : undefined}
              aria-pressed={interactive && mode === "select" ? seld : undefined}
              aria-label={
                interactive
                  ? `${s.name}, ${s.role === "process" ? s.type : s.role}, ${s.fixed ? "fixed" : "movable"}, column ${s.x + 1}, row ${s.y + 1}`
                  : undefined
              }
              style={{ cursor: mode === "flow" ? "crosshair" : interactive ? (s.fixed ? "not-allowed" : "grab") : "pointer" }}
              onPointerDown={(e) => onStationDown(e, s)}
              onPointerEnter={(e) => props.onHoverStation?.(s, e.clientX, e.clientY)}
              onPointerLeave={() => props.onHoverStation?.(null, 0, 0)}
              onFocus={interactive && mode === "select" ? () => props.onSelect?.(s.id) : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (mode === "flow") props.onPickStation?.(s.id);
                        else props.onSelect?.(s.id);
                      }
                    }
                  : undefined
              }
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
              <circle cx={PAD + ip.x * cell} cy={PAD + ip.y * cell} r={3.2} fill={TEAL} stroke={PORT_RING} strokeWidth={0.8} style={{ pointerEvents: "none" }} />
              <circle cx={PAD + op.x * cell} cy={PAD + op.y * cell} r={3.2} fill={AMBER} stroke={PORT_RING} strokeWidth={0.8} style={{ pointerEvents: "none" }} />
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
                    fill="none" stroke={hot ? NOGO_COL : AMBER} strokeWidth={1.8}
                    strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"
                  />
                </g>
              );
            })
          : null}
      </svg>
      </div>
    </div>
  );
}
