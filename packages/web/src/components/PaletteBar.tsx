import type { CellForm } from "@flowplan/core/engine/templates";
import type { Role, StationType } from "@flowplan/core/model/types";
import { navigate } from "../store/useHashRoute";
import { TEAL, AMBER, TEXTD, TYPE_COL } from "./colors";

// The palette (node-RED idiom): drag a node onto the canvas to place it. This
// makes "add a step" a spatial gesture rather than a button buried in a panel,
// and it is the defining interaction of a flow-based tool. Cell-form archetypes
// (I/U/L/S) sit alongside as one-click whole-cell arrangements.

/** A draggable node kind → the station it creates. */
export interface NodeKind {
  id: string;
  label: string;
  type: StationType;
  role: Role;
}

export const NODE_KINDS: NodeKind[] = [
  { id: "input", label: "Input", type: "store", role: "input" },
  { id: "machine", label: "Machine", type: "machine", role: "process" },
  { id: "manual", label: "Manual", type: "manual", role: "process" },
  { id: "quality", label: "Quality", type: "quality", role: "process" },
  { id: "buffer", label: "Buffer", type: "buffer", role: "process" },
  { id: "store", label: "Store", type: "store", role: "process" },
  { id: "output", label: "Output", type: "store", role: "output" },
];

const FORMS: { form: CellForm; label: string }[] = [
  { form: "I", label: "I" },
  { form: "U", label: "U" },
  { form: "L", label: "L" },
  { form: "S", label: "S" },
];

export const NODE_DND_TYPE = "application/x-flowplan-node";

export function PaletteBar({ onApplyForm }: { onApplyForm: (form: CellForm) => void }) {
  return (
    <div className="palette" role="toolbar" aria-label="Node palette">
      <span className="palette-lab">Drag on →</span>
      {NODE_KINDS.map((k) => {
        const roleCol = k.role === "input" ? TEAL : k.role === "output" ? AMBER : undefined;
        return (
          <div
            key={k.id}
            className="palette-node"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(NODE_DND_TYPE, k.id);
              e.dataTransfer.setData("text/plain", k.label);
              e.dataTransfer.effectAllowed = "copy";
            }}
            title={`Drag a ${k.label} step onto the canvas`}
            style={{ borderColor: roleCol ?? TYPE_COL[k.type] }}
          >
            <span className="palette-swatch" style={{ background: roleCol ?? TYPE_COL[k.type] }} />
            {k.label}
          </div>
        );
      })}
      <span className="palette-sep" />
      <span className="palette-lab">Form</span>
      {FORMS.map((f) => (
        <button key={f.form} className="palette-form" title={`Arrange the cell in a ${f.form} shape`} onClick={() => onApplyForm(f.form)}>
          {f.label}
        </button>
      ))}
      <span className="palette-sep" />
      <button className="palette-node" onClick={() => navigate("/library")} title="Open the process library — standard building blocks">
        📚 Library
      </button>
      <span className="palette-hint" style={{ color: TEXTD }}>· drag a node onto the grid, or a port to another node to wire</span>
    </div>
  );
}
