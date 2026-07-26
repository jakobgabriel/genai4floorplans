import { useState } from "react";
import { Modal, Stack } from "@carbon/react";
import { Btn, IconBtn } from "./Btn";
import { Save, TrashCan } from "@carbon/icons-react";
import { Footnote, SectionLabel } from "./analysisKit";
import { TextField } from "./formKit";
import { ConfirmDialog } from "./ConfirmDialog";
import { Menu, type MenuItem } from "./Menu";
import { useToast } from "./ui";
import { useT, type TFunc } from "../i18n";
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
function ago(ts: number, t: TFunc): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return t("scenario.ago.now");
  if (mins < 60) return t("scenario.ago.m", { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t("scenario.ago.h", { n: hrs });
  return t("scenario.ago.d", { n: Math.round(hrs / 24) });
}

type Pending =
  | { kind: "load" | "delete" | "overwrite"; name: string }
  | null;

export function ScenarioControls({ api, onCompare }: { api: FlowPlanApi; onCompare: () => void }) {
  const { toast } = useToast();
  const t = useT();
  const [open, setOpen] = useState(false);
  // Bumped after every write so the localStorage-backed list re-reads.
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<Pending>(null);
  const scenarios = listScenarios();

  const doLoad = (n: string) => {
    const m = loadScenario(n);
    if (m) {
      api.reset(m);
      toast(t("scenario.loaded", { name: n }));
    }
  };
  // Loading resets the store, which clears past and future — Ctrl+Z cannot bring
  // the current layout back, so anything worth keeping is confirmed first.
  const askLoad = (n: string) => (api.canUndo ? setPending({ kind: "load", name: n }) : doLoad(n));

  const write = (n: string) => {
    saveScenario(n, api.model);
    setTick((x) => x + 1);
    toast(t("scenario.saved", { name: n }));
  };

  const items: MenuItem[] =
    scenarios.length === 0
      ? [{ label: t("scenario.none"), onClick: () => setOpen(true), disabled: true }]
      : scenarios.map((s) => ({
          label: (
            <>
              {s.name} <span className="scn__when">{ago(s.savedAt, t)}</span>
            </>
          ),
          onClick: () => askLoad(s.name),
        }));
  items.push({ label: t("scenario.manage"), onClick: () => setOpen(true) });
  items.push({ label: t("scenario.compare"), onClick: onCompare });

  return (
    <>
      <IconBtn size="compact" icon={Save} label={t("scenario.save")} onClick={() => setOpen(true)} />
      <Menu
        label={scenarios.length ? t("scenario.menuCount", { n: scenarios.length }) : t("scenario.menu")}
        title={t("scenario.menuTitle")}
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
              ? t("scenario.replaceMsg")
              : pending.kind === "overwrite"
                ? t("scenario.overwriteMsg")
                : t("scenario.deleteTitle")
          }
          message={
            pending.kind === "load"
              ? t("scenario.loadBody", { name: pending.name })
              : pending.kind === "overwrite"
                ? t("scenario.overwriteBody", { name: pending.name })
                : t("scenario.deleteBody", { name: pending.name })
          }
          confirmLabel={pending.kind === "load" ? t("scenario.replace") : pending.kind === "overwrite" ? t("scenario.overwrite") : t("scenario.delete")}
          danger
          onConfirm={() => {
            if (pending.kind === "load") doLoad(pending.name);
            else if (pending.kind === "overwrite") write(pending.name);
            else {
              deleteScenario(pending.name);
              setTick((x) => x + 1);
              toast(t("scenario.deleted", { name: pending.name }));
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
  const t = useT();
  const [name, setName] = useState(api.model.name || "Variant");
  const clean = name.trim() || api.model.name || "Variant";
  return (
    <Modal
      open
      className="scn"
      modalHeading={t("scenario.menu")}
      primaryButtonText={t("scenario.save")}
      secondaryButtonText={t("scenario.done")}
      onRequestClose={onClose}
      // Save keeps the dialog open so you can name and save several in a row;
      // Done (the secondary) is what closes it.
      onRequestSubmit={() => onSave(clean)}
    >
      <p>{t("scenario.modalDesc")}</p>
      <Stack gap={5}>
        <TextField
          id="scenario-name"
          labelText={t("scenario.name")}
          placeholder={t("scenario.namePlaceholder")}
          value={name}
          onChange={setName}
        />
        <Stack gap={3}>
          <SectionLabel>{t("scenario.savedList")}</SectionLabel>
          {scenarios.length === 0 ? (
            <Footnote>{t("scenario.none")}</Footnote>
          ) : (
            <Stack gap={2}>
              {scenarios.map((s) => (
                <div key={s.name} className="fk-listrow">
                  <Btn size="compact" variant="ghost" className="fk-listrow__main" onClick={() => onLoad(s.name)}>
                    {s.name} <span className="scn__when">{ago(s.savedAt, t)}</span>
                  </Btn>
                  <IconBtn
                    size="compact"
                    variant="danger"
                    icon={TrashCan}
                    label={t("scenario.deleteNamed", { name: s.name })}
                    tooltipPosition="left"
                    onClick={() => onDelete(s.name)}
                  />
                </div>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}
