import { useCallback, useEffect, useRef, useState } from "react";
import type { Flow, Model, NoGoZone, Station } from "../model/types";
import type { ChainResult } from "../engine/automation";
import type { Slot } from "../engine/templates";
import { center, clampToGrid, hasCollision } from "../engine/geometry";
import { AMBER, AUTO_COL, ERGO_COL, LINE, PANEL2, RED, TEAL, TEALD, TEXT, TEXTD, TYPE_COL } from "./colors";

export type CanvasMode = "select" | "flow" | "nogo";

interface Props {
  model: Model;
  stations: Station[];
  flows: Flow[];
  chain?: ChainResult;
  ghost?: Station[];
  template?: Slot[] | null;
  selId?: string | null;
  label: string;
  badge: string;
  cell: number;
  interactive?: boolean;
  mode?: CanvasMode;
  flowFirst?: string | null;
  selFlow?: { from: string; to: string } | null;
  onSelect?: (id: string | null) => void;
  onSelectFlow?: (f: { from: string; to: string } | null) => void;
  onHoverStation?: (s: Station | null, clientX: number, clientY: number) => void;
  onMoveStart?: () => void;
  onMove?: (id: string, x: number, y: number) => void;
  onPickStation?: (id: string) => void;
  onAddNoGo?: (zone: NoGoZone) => void;
}

const PAD = 12;

export function LayoutCanvas(props: Props) {
  const { model, stations, flows, chain, ghost, template, selId, label, badge, cell, interactive } = props;
  const mode: CanvasMode = props.mode ?? "select";
  const svgRef = useRef<SVGSVGElement | null>(null);
  const baseW = model.gridW * cell + PAD * 2;
  const baseH = model.gridH * cell + PAD * 2;

  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ id: string | null; pan: boolean; nogo: { x: number; y: number } | null }>({
    id: null,
    pan: false,
    nogo: null,
  });
  const [nogoRect, setNogoRect] = useState<NoGoZone | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
        setNogoRect({
          x: Math.max(0, Math.round(x0)),
          y: Math.max(0, Math.round(y0)),
          w: Math.max(1, Math.round(Math.abs(g.x - d.nogo.x))),
          h: Math.max(1, Math.round(Math.abs(g.y - d.nogo.y))),
        });
      }
    }
    function upHandler() {
      const d = dragRef.current;
      if (d.nogo && nogoRect && props.onAddNoGo) props.onAddNoGo(nogoRect);
      dragRef.current = { id: null, pan: false, nogo: null };
      panStart.current = null;
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
  }, [interactive, props, stations, toGrid, vbW, baseW, nogoRect]);

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

  const byId: Record<string, Station> = {};
  stations.forEach((s) => (byId[s.id] = s));
  const linkKind: Record<string, string> = {};
  (chain?.links ?? []).forEach((l) => (linkKind[l.from + ">" + l.to] = l.kind));

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
          const ca = center(a);
          const cb = center(b);
          const w = 0.5 + (f.volume / 1200) * 3;
          const k = linkKind[f.from + ">" + f.to];
          const col = k === "auto-island" ? RED : k === "chained-auto" ? TEAL : k === "mixed" ? AMBER : badge;
          const dash = k === "manual" || k === "mixed" ? "5 4" : undefined;
          const sel = props.selFlow && props.selFlow.from === f.from && props.selFlow.to === f.to;
          const x1 = PAD + ca.x * cell;
          const y1 = PAD + ca.y * cell;
          const x2 = PAD + cb.x * cell;
          const y2 = PAD + cb.y * cell;
          return (
            <g key={"f" + i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={sel ? TEXT : col} strokeWidth={sel ? w + 1.5 : w} opacity={k ? 0.75 : 0.45} strokeDasharray={dash} />
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

        {(ghost ?? []).map((s) => {
          const cur = byId[s.id];
          if (!cur || (cur.x === s.x && cur.y === s.y)) return null;
          return (
            <g key={"g" + s.id}>
              <rect x={PAD + s.x * cell} y={PAD + s.y * cell} width={s.w * cell} height={s.h * cell} fill="none" stroke={AMBER} strokeWidth={1.5} strokeDasharray="5 4" rx={4} opacity={0.85} />
              <line x1={PAD + center(cur).x * cell} y1={PAD + center(cur).y * cell} x2={PAD + center(s).x * cell} y2={PAD + center(s).y * cell} stroke={AMBER} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
            </g>
          );
        })}

        {stations.map((s) => {
          const seld = selId === s.id;
          const picked = props.flowFirst === s.id;
          const colliding = draggingId === s.id && dragCollide;
          const roleStroke = s.role === "input" ? TEAL : s.role === "output" ? AMBER : null;
          return (
            <g
              key={s.id}
              style={{ cursor: mode === "flow" ? "crosshair" : interactive ? (s.fixed ? "not-allowed" : "grab") : "pointer" }}
              onPointerDown={(e) => onStationDown(e, s)}
              onPointerEnter={(e) => props.onHoverStation?.(s, e.clientX, e.clientY)}
              onPointerLeave={() => props.onHoverStation?.(null, 0, 0)}
            >
              <rect x={PAD + s.x * cell} y={PAD + s.y * cell} width={s.w * cell} height={s.h * cell} rx={5} fill={colliding ? "#3a1f1c" : TYPE_COL[s.type] || PANEL2} stroke={colliding ? RED : picked ? TEAL : seld ? TEAL : s.fixed ? AMBER : TEALD} strokeWidth={picked || seld || colliding ? 2 : 1.2} />
              {roleStroke ? <rect x={PAD + s.x * cell + 1} y={PAD + s.y * cell + 1} width={s.w * cell - 2} height={s.h * cell - 2} rx={4} fill="none" stroke={roleStroke} strokeWidth={1} strokeDasharray="2 2" opacity={0.7} /> : null}
              <circle cx={PAD + s.x * cell + 7} cy={PAD + s.y * cell + 7} r={3} fill={ERGO_COL[s.ergoRisk] || TEXTD} />
              <circle cx={PAD + (s.x + s.w) * cell - 7} cy={PAD + s.y * cell + 7} r={3} fill={AUTO_COL[s.auto] || TEXTD} />
              <text x={PAD + (s.x + s.w / 2) * cell} y={PAD + (s.y + s.h / 2) * cell - 5} fill={TEXT} fontSize={10} fontWeight={600} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none", fontFamily: "'IBM Plex Sans',sans-serif" }}>
                {s.name}
              </text>
              <text x={PAD + (s.x + s.w / 2) * cell} y={PAD + (s.y + s.h / 2) * cell + 7} fill={s.fixed ? AMBER : TEXTD} fontSize={7.5} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none" }}>
                {s.role !== "process" ? s.role.toUpperCase() : s.auto + " · " + s.operators + "op"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
