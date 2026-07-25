import { useMemo, useState } from "react";
import { Button, Search, SelectItem, Tag } from "@carbon/react";
import { Add, ChevronDown, ChevronRight, TrashCan } from "@carbon/icons-react";
import type { LibraryProcess } from "@flowplan/core/model/library";
import type { WorkClass } from "@flowplan/core/model/types";
import type { LibraryApi } from "../store/library";
import { IconBtn } from "./Btn";
import { Footnote } from "./analysisKit";
import { NumberField, SelectField, TextField } from "./formKit";

/** Carbon hands back `number | string`; a cleared field must not become NaN. */
const n0 = (v: number | string) => Math.max(0, Number(v) || 0);

/**
 * The process library: the steps this plant knows how to do.
 *
 * The list is the point, so a row is one line — name, cycle, what kind of work
 * it is — and the primary action on it is "use this", not "edit this". Editing
 * is behind the row's own disclosure, because a planner opens this panel to
 * place a step twenty times for every once they open it to change a number.
 */

const classTag = (c: WorkClass): "green" | "gray" | "red" => (c === "VA" ? "green" : c === "NNVA" ? "gray" : "red");

export function LibraryPanel({
  lib,
  onUse,
  useLabel,
}: {
  lib: LibraryApi;
  /** What "use this process" means here — add a station, append to a routing. */
  onUse?: (p: LibraryProcess) => void;
  useLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return lib.processes;
    return lib.processes.filter((p) => p.name.toLowerCase().includes(n) || p.capabilityId.includes(n));
  }, [lib.processes, q]);

  return (
    <div className="lib">
      <Search
        id="lib-search"
        size="sm"
        labelText="Find a process"
        placeholder="Find a process"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onClear={() => setQ("")}
      />

      <div className="lib__list">
        {shown.map((p) => {
          const open = openId === p.id;
          return (
            <div className={"lib__item" + (open ? " open" : "")} key={p.id}>
              <div className="lib__row">
                <button
                  type="button"
                  className="lib__disclose"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : p.id)}
                >
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="lib__name">{p.name}</span>
                </button>
                <span className="lib__sec">{p.cycleTimeSec}s</span>
                <Tag type={classTag(p.classification)} size="sm">
                  {p.classification}
                </Tag>
                {/* Icon-only: at the drawer's width a text button left about
                    forty pixels for the name, which is the one thing on the
                    row you have to be able to read. */}
                {onUse ? (
                  <IconBtn
                    size="compact"
                    icon={Add}
                    label={`${useLabel ?? "Use"} — ${p.name}`}
                    tooltipPosition="left"
                    onClick={() => onUse(p)}
                  />
                ) : null}
              </div>

              {open ? (
                <div className="lib__edit">
                  <TextField id={"lp-n-" + p.id} labelText="Name" value={p.name} onChange={(v) => lib.update(p.id, { name: v })} />
                  <div className="lib__grid">
                    <NumberField
                      id={"lp-c-" + p.id}
                      label="Cycle (s)"
                      value={p.cycleTimeSec}
                      min={0}
                      onChange={(v) => lib.update(p.id, { cycleTimeSec: n0(v) })}
                    />
                    <NumberField
                      id={"lp-a-" + p.id}
                      label="Operator bound (%)"
                      value={Math.round(p.attendedFraction * 100)}
                      min={0}
                      max={100}
                      onChange={(v) => lib.update(p.id, { attendedFraction: Math.min(1, n0(v) / 100) })}
                    />
                    <SelectField
                      id={"lp-k-" + p.id}
                      labelText="Work class"
                      value={p.classification}
                      onChange={(v) => lib.update(p.id, { classification: v as WorkClass })}
                    >
                      <SelectItem value="VA" text="VA — value add" />
                      <SelectItem value="NNVA" text="NNVA — necessary" />
                      <SelectItem value="NVA" text="NVA — waste" />
                    </SelectField>
                    <SelectField
                      id={"lp-t-" + p.id}
                      labelText="Station type"
                      value={p.type}
                      options={["machine", "manual", "quality", "store", "buffer"]}
                      onChange={(v) => lib.update(p.id, { type: v as LibraryProcess["type"] })}
                    />
                    <NumberField
                      id={"lp-o-" + p.id}
                      label="Changeover (min)"
                      value={p.changeoverMin}
                      min={0}
                      onChange={(v) => lib.update(p.id, { changeoverMin: n0(v) })}
                    />
                    <NumberField
                      id={"lp-x-" + p.id}
                      label="Capex"
                      value={p.capex}
                      min={0}
                      onChange={(v) => lib.update(p.id, { capex: n0(v) })}
                    />
                    <NumberField
                      id={"lp-e-" + p.id}
                      label="Power (kW)"
                      value={p.energyKw}
                      min={0}
                      onChange={(v) => lib.update(p.id, { energyKw: n0(v) })}
                    />
                  </div>
                  <div className="lib__editFoot">
                    <Footnote>
                      Capability <code>{p.capabilityId}</code> — what the engine classifies this as.
                    </Footnote>
                    <IconBtn
                      size="compact"
                      icon={TrashCan}
                      label={"Remove " + p.name}
                      tooltipPosition="left"
                      onClick={() => {
                        lib.remove(p.id);
                        setOpenId(null);
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {shown.length === 0 ? (
          <p className="lib__empty">
            {lib.processes.length === 0
              ? "The library is empty. Add a process, or restore the seeded ones."
              : `Nothing matches “${q}”.`}
          </p>
        ) : null}
      </div>

      <div className="lib__foot">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Add}
          onClick={() => {
            const p = lib.add();
            setQ("");
            setOpenId(p.id);
          }}
        >
          New process
        </Button>
        <Button
          kind="ghost"
          size="sm"
          onClick={() => {
            const n = lib.restoreSeeded();
            setNote(n === 0 ? "Every seeded step is already here." : `Restored ${n} seeded step${n === 1 ? "" : "s"}.`);
          }}
        >
          Restore seeded
        </Button>
      </div>
      {note ? <Footnote>{note}</Footnote> : null}
    </div>
  );
}
