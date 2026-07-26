import { useMemo, useState } from "react";
import { Tag, TextInput, Tile } from "@carbon/react";
import { Add, Copy, Edit, TrashCan } from "@carbon/icons-react";
import { buildRating } from "@flowplan/core/engine/rating";
import { costAnalysis } from "@flowplan/core/engine/cost";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { PageHead } from "../components/PageHead";
import { Btn, IconBtn } from "../components/Btn";
import { scoreTag } from "../components/analysisKit";

/**
 * The store of cell plans.
 *
 * Every plan the workspace holds, in one place, reachable from the front door
 * — not buried in the editor's Explorer drawer. Each card opens its plan into
 * the editor, and the numbers on it (grade, output, cost) are the same the
 * engine shows once it is open, so a plan can be recognised without opening it.
 */

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
  // Full models (the active cell carries its live edits) so each card can carry
  // its rating without the store having to open the plan first.
  const cells = useMemo(() => api.snapshotCells(), [api]);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="page plans">
      <PageHead
        title="Cell plans"
        actions={
          <Btn variant="primary" size="compact" icon={Add} onClick={onNew}>
            New plan
          </Btn>
        }
      />

      {cells.length === 0 ? (
        <Tile className="plans__empty">
          <h2 className="plans__emptyTitle">No plans yet</h2>
          <p>Plan a cell, and it is saved here as you go.</p>
          <div className="plans__emptyActions">
            <Btn variant="primary" icon={Add} onClick={onNew}>
              New plan
            </Btn>
          </div>
        </Tile>
      ) : (
        <div className="plans__grid">
          {cells.map((c) => {
            const process = c.model.stations.filter((s) => s.role === "process");
            const rating = buildRating(c.model, { restarts: 0 });
            const cost = costAnalysis(c.model);
            const active = c.id === api.activeId;
            return (
              <Tile key={c.id} className={"plan-card" + (active ? " plan-card--active" : "")}>
                <div className="plan-card__head">
                  {renaming === c.id ? (
                    <TextInput
                      id={"rename-" + c.id}
                      labelText="Plan name"
                      hideLabel
                      size="sm"
                      autoFocus
                      defaultValue={c.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v) api.renameCell(c.id, v);
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <button type="button" className="plan-card__name" onClick={() => onOpen(c.id)}>
                      {c.name}
                    </button>
                  )}
                  <Tag type={scoreTag(rating.composite)} size="sm">
                    {rating.letter}
                  </Tag>
                </div>

                <dl className="plan-card__stats">
                  <div>
                    <dt>Output</dt>
                    <dd>{num(rating.balance.lineOut)}/sh</dd>
                  </div>
                  <div>
                    <dt>Cost/part</dt>
                    <dd>{cost.currency + cost.costPerPart.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Steps</dt>
                    <dd>{process.length}</dd>
                  </div>
                </dl>

                <div className="plan-card__actions">
                  <Btn variant="primary" size="compact" onClick={() => onOpen(c.id)}>
                    Open
                  </Btn>
                  <IconBtn
                    size="compact"
                    icon={Edit}
                    label={"Rename " + c.name}
                    onClick={() => setRenaming(c.id)}
                  />
                  <IconBtn
                    size="compact"
                    icon={Copy}
                    label={"Duplicate " + c.name}
                    onClick={() => api.addCell(c.model, c.name + " (copy)", c.folderId)}
                  />
                  <IconBtn
                    size="compact"
                    variant="danger"
                    icon={TrashCan}
                    label={"Archive " + c.name}
                    tooltipPosition="left"
                    onClick={() => api.archiveCell(c.id)}
                  />
                </div>
              </Tile>
            );
          })}
        </div>
      )}
    </div>
  );
}
