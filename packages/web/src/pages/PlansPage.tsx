import { useMemo, useState } from "react";
import { Tag, TextInput, Tile } from "@carbon/react";
import { Add, Copy, Edit, TrashCan } from "@carbon/icons-react";
import { buildRating } from "@flowplan/core/engine/rating";
import { costAnalysis } from "@flowplan/core/engine/cost";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { PageHead } from "../components/PageHead";
import { Btn, IconBtn, TabBtn } from "../components/Btn";
import { scoreTag } from "../components/analysisKit";
import { useT } from "../i18n";

/**
 * The store of cell plans.
 *
 * Every plan the workspace holds, in one place, reachable from the front door
 * — not buried in the editor's Explorer drawer. It offers two layouts: tiles
 * (a card per plan, room for the headline numbers) and a list (a dense row per
 * plan, more plans on screen at once). Each opens its plan into the editor, and
 * the numbers are the engine's own, so a plan can be recognised without opening
 * it.
 */

type PlansView = "tiles" | "list";
const num = (n: number) => Math.round(n).toLocaleString();

export function PlansPage({
  api,
  onOpen,
  onNew,
}: {
  api: FlowPlanApi;
  /** Open a plan into the editor. */
  onOpen: (id: string) => void;
  /** Start a fresh plan. */
  onNew: () => void;
}) {
  const t = useT();
  const [view, setView] = useState<PlansView>("tiles");
  const [renaming, setRenaming] = useState<string | null>(null);

  // Full models (the active cell carries its live edits), enriched with the
  // engine's rating and cost so both layouts read the same figures.
  const plans = useMemo(
    () =>
      api.snapshotCells().map((c) => {
        const rating = buildRating(c.model, { restarts: 0 });
        const cost = costAnalysis(c.model);
        return {
          cell: c,
          active: c.id === api.activeId,
          letter: rating.letter,
          composite: rating.composite,
          output: rating.balance.lineOut,
          costPerPart: cost.currency + cost.costPerPart.toFixed(2),
          steps: c.model.stations.filter((s) => s.role === "process").length,
        };
      }),
    [api],
  );

  const rename = (id: string, el: HTMLInputElement) => {
    const v = el.value.trim();
    if (v) api.renameCell(id, v);
    setRenaming(null);
  };

  return (
    <div className="page plans">
      <PageHead
        title={t("plans.title")}
        actions={
          <>
            {/* TabBtn carries role="tab", which ARIA requires to sit inside a
                role="tablist" (axe: aria-required-parent). */}
            <div className="plans__views" role="tablist" aria-label={t("common.tiles") + " / " + t("common.list")}>
              <TabBtn selected={view === "list"} onClick={() => setView("list")}>
                {t("common.list")}
              </TabBtn>
              <TabBtn selected={view === "tiles"} onClick={() => setView("tiles")}>
                {t("common.tiles")}
              </TabBtn>
            </div>
            <Btn variant="primary" size="compact" icon={Add} onClick={onNew}>
              {t("common.newPlan")}
            </Btn>
          </>
        }
      />

      {plans.length === 0 ? (
        <Tile className="plans__empty">
          <h2 className="plans__emptyTitle">{t("plans.empty.title")}</h2>
          <p>{t("plans.empty.body")}</p>
          <div className="plans__emptyActions">
            <Btn variant="primary" icon={Add} onClick={onNew}>
              {t("common.newPlan")}
            </Btn>
          </div>
        </Tile>
      ) : view === "list" ? (
        <div className="plans__scroll">
          <table className="plans__list">
            <thead>
              <tr>
                <th>{t("plans.col.plan")}</th>
                <th className="plans__num">{t("plans.col.grade")}</th>
                <th className="plans__num">{t("plans.col.output")}</th>
                <th className="plans__num">{t("plans.col.cost")}</th>
                <th className="plans__num">{t("plans.col.steps")}</th>
                <th>
                  <span className="cds--visually-hidden">{t("plans.col.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.cell.id} className={p.active ? "plans__rowActive" : undefined}>
                  <td>
                    {renaming === p.cell.id ? (
                      <TextInput
                        id={"rename-" + p.cell.id}
                        labelText="Plan name"
                        hideLabel
                        size="sm"
                        autoFocus
                        defaultValue={p.cell.name}
                        onBlur={(e) => rename(p.cell.id, e.target)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                      />
                    ) : (
                      <button type="button" className="plans__nameLink" onClick={() => onOpen(p.cell.id)}>
                        {p.cell.name}
                      </button>
                    )}
                  </td>
                  <td className="plans__num">
                    <Tag type={scoreTag(p.composite)} size="sm">
                      {p.letter}
                    </Tag>
                  </td>
                  <td className="plans__num">{num(p.output)}/sh</td>
                  <td className="plans__num">{p.costPerPart}</td>
                  <td className="plans__num">{p.steps}</td>
                  <td className="plans__rowActions">
                    <Btn variant="ghost" size="compact" onClick={() => onOpen(p.cell.id)}>
                      Open
                    </Btn>
                    <IconBtn size="compact" icon={Edit} label={"Rename " + p.cell.name} onClick={() => setRenaming(p.cell.id)} />
                    <IconBtn
                      size="compact"
                      icon={Copy}
                      label={"Duplicate " + p.cell.name}
                      onClick={() => api.addCell(p.cell.model, p.cell.name + " (copy)", p.cell.folderId)}
                    />
                    <IconBtn
                      size="compact"
                      variant="danger"
                      icon={TrashCan}
                      label={"Archive " + p.cell.name}
                      tooltipPosition="left"
                      onClick={() => api.archiveCell(p.cell.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="plans__grid">
          {plans.map((p) => (
            <Tile key={p.cell.id} className={"plan-card" + (p.active ? " plan-card--active" : "")}>
              <div className="plan-card__head">
                {renaming === p.cell.id ? (
                  <TextInput
                    id={"rename-" + p.cell.id}
                    labelText="Plan name"
                    hideLabel
                    size="sm"
                    autoFocus
                    defaultValue={p.cell.name}
                    onBlur={(e) => rename(p.cell.id, e.target)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <button type="button" className="plan-card__name" onClick={() => onOpen(p.cell.id)}>
                    {p.cell.name}
                  </button>
                )}
                <Tag type={scoreTag(p.composite)} size="sm">
                  {p.letter}
                </Tag>
              </div>

              <dl className="plan-card__stats">
                <div>
                  <dt>Output</dt>
                  <dd>{num(p.output)}/sh</dd>
                </div>
                <div>
                  <dt>Cost/part</dt>
                  <dd>{p.costPerPart}</dd>
                </div>
                <div>
                  <dt>Steps</dt>
                  <dd>{p.steps}</dd>
                </div>
              </dl>

              <div className="plan-card__actions">
                <Btn variant="primary" size="compact" onClick={() => onOpen(p.cell.id)}>
                  Open
                </Btn>
                <IconBtn size="compact" icon={Edit} label={"Rename " + p.cell.name} onClick={() => setRenaming(p.cell.id)} />
                <IconBtn
                  size="compact"
                  icon={Copy}
                  label={"Duplicate " + p.cell.name}
                  onClick={() => api.addCell(p.cell.model, p.cell.name + " (copy)", p.cell.folderId)}
                />
                <IconBtn
                  size="compact"
                  variant="danger"
                  icon={TrashCan}
                  label={"Archive " + p.cell.name}
                  tooltipPosition="left"
                  onClick={() => api.archiveCell(p.cell.id)}
                />
              </div>
            </Tile>
          ))}
        </div>
      )}
    </div>
  );
}
