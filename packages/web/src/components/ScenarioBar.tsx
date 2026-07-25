import { useState } from "react";
import { Stack } from "@carbon/react";
import { Btn, IconBtn } from "./Btn";
import { Save, TrashCan } from "@carbon/icons-react";
import { Footnote, SectionLabel } from "./analysisKit";
import { TextField } from "./formKit";
import { ConfirmDialog } from "./ConfirmDialog";
import { Menu, type MenuItem } from "./Menu";
import { useToast } from "./ui";
import { deleteScenario, listScenarios, loadScenario, saveScenario } from "../store/scenarios";
import type { FlowPlanApi } from "../store/useFlowPlan";

/**
 * Saving a variant is a toolbar action, not a panel section.
 *
 * It used to live at the very bottom of Build ▸ Flow, below validation, flow
 * drawing, templates, layout settings and no-go zones — six sections down a
 * panel nobody scrolls to look for "save". Save is the one thing a planner
 * reaches for by reflex, so it sits next to undo/redo and export where reflex
 * puts it, and the saved variants are one click away in the same place.
 */

/** "just now" / "3h ago" — enough to tell a fresh save from last week's. */
function ago(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.round(hrs / 24) + "d ago";
}

type Pending =
  | { kind: "load" | "delete" | "overwrite"; name: string }
  | null;

export function ScenarioControls({ api, onCompare }: { api: FlowPlanApi; onCompare: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  // Bumped after every write so the localStorage-backed list re-reads.
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<Pending>(null);
  const scenarios = listScenarios();

  const doLoad = (n: string) => {
    const m = loadScenario(n);
    if (m) {
      api.reset(m);
      toast("Loaded “" + n + "”");
    }
  };
  // Loading resets the store, which clears past and future — Ctrl+Z cannot bring
  // the current layout back, so anything worth keeping is confirmed first.
  const askLoad = (n: string) => (api.canUndo ? setPending({ kind: "load", name: n }) : doLoad(n));

  const write = (n: string) => {
    saveScenario(n, api.model);
    setTick((t) => t + 1);
    toast("Saved variant “" + n + "”");
  };

  const items: MenuItem[] =
    scenarios.length === 0
      ? [{ label: "No variants saved yet", onClick: () => setOpen(true), disabled: true }]
      : scenarios.map((s) => ({
          label: (
            <>
              {s.name} <span className="scn__when">{ago(s.savedAt)}</span>
            </>
          ),
          onClick: () => askLoad(s.name),
        }));
  items.push({ label: "Manage variants…", onClick: () => setOpen(true) });
  items.push({ label: "Compare variants", onClick: onCompare });

  return (
    <>
      <Btn size="compact" icon={Save} onClick={() => setOpen(true)}>
        Save variant
      </Btn>
      <Menu
        label={`Variants${scenarios.length ? ` (${scenarios.length})` : ""} ▾`}
        title="Load, manage and compare saved variants"
        items={items}
      />
      {open ? (
        <ScenarioModal
          api={api}
          key={tick}
          scenarios={scenarios}
          onSave={(n) => (scenarios.some((s) => s.name === n) ? setPending({ kind: "overwrite", name: n }) : write(n))}
          onLoad={askLoad}
          onDelete={(n) => setPending({ kind: "delete", name: n })}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {pending ? (
        <ConfirmDialog
          title={
            pending.kind === "load"
              ? "Replace the current layout?"
              : pending.kind === "overwrite"
                ? "Overwrite this variant?"
                : "Delete variant"
          }
          message={
            pending.kind === "load"
              ? `Loading “${pending.name}” replaces the layout you are working on, and undo history is cleared — this cannot be undone. Save the current layout as a variant first if you want to keep it.`
              : pending.kind === "overwrite"
                ? `A variant called “${pending.name}” already exists. Saving replaces what it holds, and the old contents cannot be recovered.`
                : `Delete the variant “${pending.name}”? This cannot be undone.`
          }
          confirmLabel={pending.kind === "load" ? "Replace" : pending.kind === "overwrite" ? "Overwrite" : "Delete"}
          danger
          onConfirm={() => {
            if (pending.kind === "load") doLoad(pending.name);
            else if (pending.kind === "overwrite") write(pending.name);
            else {
              deleteScenario(pending.name);
              setTick((t) => t + 1);
              toast("Deleted “" + pending.name + "”");
            }
          }}
          onClose={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

function ScenarioModal({
  api,
  scenarios,
  onSave,
  onLoad,
  onDelete,
  onClose,
}: {
  api: FlowPlanApi;
  scenarios: { name: string; savedAt: number }[];
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(api.model.name || "Variant");
  const clean = name.trim() || api.model.name || "Variant";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal scn" onClick={(e) => e.stopPropagation()}>
        <h2>Variants</h2>
        <p>
          A named snapshot of this layout, to load back or compare.
        </p>
        <Stack gap={5}>
          <div className="fk-inline">
            <TextField
              id="scenario-name"
              labelText="Name"
              placeholder="name this variant…"
              value={name}
              onChange={setName}
            />
            <Btn variant="primary" onClick={() => onSave(clean)}>
              Save variant
            </Btn>
          </div>
          <Stack gap={3}>
            <SectionLabel>Saved variants</SectionLabel>
            {scenarios.length === 0 ? (
              <Footnote>No variants saved yet.</Footnote>
            ) : (
              <Stack gap={2}>
                {scenarios.map((s) => (
                  <div key={s.name} className="fk-listrow">
                    <Btn size="compact" variant="ghost" className="fk-listrow__main" onClick={() => onLoad(s.name)}>
                      {s.name} <span className="scn__when">{ago(s.savedAt)}</span>
                    </Btn>
                    <IconBtn
                      size="compact"
                      variant="danger"
                      icon={TrashCan}
                      label={`Delete ${s.name}`}
                      tooltipPosition="left"
                      onClick={() => onDelete(s.name)}
                    />
                  </div>
                ))}
              </Stack>
            )}
          </Stack>
          <div className="modal__actions">
            <Btn variant="ghost" onClick={onClose}>
              Done
            </Btn>
          </div>
        </Stack>
      </div>
    </div>
  );
}
