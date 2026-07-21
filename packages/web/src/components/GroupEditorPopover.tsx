import { TextInput, TextArea, Button } from "@carbon/react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { CloseButton } from "./CloseButton";

// Inline editor for a documentation group selected on the canvas. A group is a
// labelled, commented box drawn around machines to document the layout — it
// never affects placement, flow or the rating.
export function GroupEditorPopover({
  api,
  groupId,
  onClose,
  onSaveSubflow,
}: {
  api: FlowPlanApi;
  groupId: string;
  onClose: () => void;
  /** Promote the group's machines to a reusable subflow (see subflow feature). */
  onSaveSubflow?: (groupId: string) => void;
}) {
  const g = (api.model.groups ?? []).find((x) => x.id === groupId);
  if (!g) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        zIndex: 26,
        width: 240,
        background: "var(--cds-layer-02)",
        border: "1px solid var(--cds-border-subtle-01)",
        padding: "var(--cds-spacing-05)",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--cds-spacing-04)" }}>
        <span style={{ fontSize: "0.75rem", letterSpacing: "0.32px", textTransform: "uppercase", color: "var(--cds-text-secondary)" }}>Group</span>
        <CloseButton onClick={onClose} />
      </div>
      <TextInput
        id="grp-label"
        labelText="Label"
        value={g.label}
        onFocus={api.checkpoint}
        onChange={(e) => api.live({ type: "UPDATE_GROUP", id: g.id, patch: { label: e.target.value } })}
      />
      <div style={{ marginTop: "var(--cds-spacing-04)" }}>
        <TextArea
          id="grp-comment"
          labelText="Comment"
          rows={3}
          placeholder="Document what this group is…"
          value={g.comment ?? ""}
          onFocus={api.checkpoint}
          onChange={(e) => api.live({ type: "UPDATE_GROUP", id: g.id, patch: { comment: e.target.value } })}
        />
      </div>
      {onSaveSubflow ? (
        <Button size="sm" kind="tertiary" style={{ width: "100%", maxWidth: "none", marginTop: "var(--cds-spacing-04)" }} onClick={() => onSaveSubflow(g.id)}>
          Save as reusable subflow
        </Button>
      ) : null}
      <Button
        size="sm"
        kind="danger--tertiary"
        style={{ width: "100%", maxWidth: "none", marginTop: "var(--cds-spacing-03)" }}
        onClick={() => {
          api.commit({ type: "REMOVE_GROUP", id: g.id });
          onClose();
        }}
      >
        Delete group
      </Button>
    </div>
  );
}
