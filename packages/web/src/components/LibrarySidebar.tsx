import type { CellForm } from "@flowplan/core/engine/templates";
import { ZONE_KINDS } from "@flowplan/core/model/types";
import type { useLibrary } from "../store/library";
import type { useSubflows } from "../store/subflows";
import { navigate } from "../store/useHashRoute";
import { NODE_KINDS, NODE_DND_TYPE } from "./PaletteBar";
import { Resizer } from "./Resizer";
import { AMBER, TEAL, TEXTD, TYPE_COL, ZONE_STYLE } from "./colors";

// The node-RED-style left library rail. It carries the whole vocabulary of
// things you can drop on the canvas — station nodes, cell forms, non-station
// zones, catalog entries (seed + custom), and grouped subflows — plus a link to
// the full library page. Collapsible and drag-resizable so the canvas can take
// the space when you want it to.

const FORMS: CellForm[] = ["I", "U", "L", "S"];

function dragProps(kind: string, label: string) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(NODE_DND_TYPE, kind);
      e.dataTransfer.setData("text/plain", label);
      e.dataTransfer.effectAllowed = "copy" as const;
    },
  };
}

interface Props {
  library: ReturnType<typeof useLibrary>;
  subflows: ReturnType<typeof useSubflows>;
  onApplyForm: (form: CellForm) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  width: number;
  setWidth: (w: number) => void;
}

export function LibrarySidebar({ library, subflows, onApplyForm, collapsed, setCollapsed, width, setWidth }: Props) {
  if (collapsed) {
    return (
      <div className="libside collapsed">
        <div className="rail">
          <button className="btn sm rail-btn" onClick={() => setCollapsed(false)} title="Show the library">
            📚 Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="libside" style={{ flexBasis: width, width }}>
        <div className="libside__head">
          <span className="lab">Library</span>
          <button className="chip" title="Collapse the library" onClick={() => setCollapsed(true)}>◀</button>
        </div>
        <div className="libside__scroll">
          {/* Station nodes — the core node-RED palette. */}
          <div className="libside__group">Nodes</div>
          <div className="libside__nodes">
            {NODE_KINDS.map((k) => {
              const roleCol = k.role === "input" ? TEAL : k.role === "output" ? AMBER : undefined;
              return (
                <div key={k.id} className="libside__node" {...dragProps(k.id, k.label)} title={`Drag a ${k.label} step onto the canvas`} style={{ borderColor: roleCol ?? TYPE_COL[k.type] }}>
                  <span className="lib-swatch" style={{ background: roleCol ?? TYPE_COL[k.type] }} />
                  {k.label}
                </div>
              );
            })}
          </div>

          {/* Cell forms — one-click whole-cell arrangements. */}
          <div className="libside__group">Forms</div>
          <div className="libside__forms">
            {FORMS.map((f) => (
              <button key={f} className="palette-form" title={`Arrange the cell in a ${f} shape`} onClick={() => onApplyForm(f)}>{f}</button>
            ))}
          </div>

          {/* Non-station elements — reserved and blocked space. */}
          <div className="libside__group">Elements</div>
          <div className="libside__nodes">
            {ZONE_KINDS.map((zk) => (
              <div key={zk} className="libside__node" {...dragProps("zone:" + zk, ZONE_STYLE[zk].label)} title={`Drag a ${ZONE_STYLE[zk].label} onto the canvas`} style={{ borderColor: ZONE_STYLE[zk].stroke }}>
                <span className="lib-swatch" style={{ background: ZONE_STYLE[zk].stroke }} />
                {ZONE_STYLE[zk].label}
              </div>
            ))}
          </div>

          {/* Catalog entries — seed + custom building blocks. */}
          <div className="libside__group">Processes <button className="libside__manage" onClick={() => navigate("/library")}>manage</button></div>
          {library.entries.map((e) => (
            <div key={e.id} className="lib-item" {...dragProps("lib:" + e.id, e.name)} title="Drag onto the canvas">
              <span className="lib-swatch" style={{ background: TYPE_COL[e.stationType] }} />
              <span className="lib-item__name">{e.name}</span>
              {e.custom ? <span className="lib-tag">c</span> : null}
              <span className="lib-item__meta">{e.cycleTimeSec}s</span>
            </div>
          ))}

          {/* Grouped subflows. */}
          <div className="libside__group">Grouped</div>
          {subflows.subflows.length === 0 ? (
            <div className="libside__empty">Use ⧉ Group on the canvas to save steps as a reusable element.</div>
          ) : (
            subflows.subflows.map((sf) => (
              <div key={sf.id} className="lib-item" {...dragProps("sub:" + sf.id, sf.name)} title="Drag onto the canvas">
                <span className="lib-swatch" style={{ background: TEAL }} />
                <span className="lib-item__name">{sf.name}</span>
                <span className="lib-item__meta">{sf.stations.length}</span>
              </div>
            ))
          )}
          <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 10 }}>Drag any item onto the canvas.</div>
        </div>
      </div>
      <Resizer edge="right" width={width} setWidth={setWidth} min={200} max={480} />
    </>
  );
}
