import { useMemo, useState } from "react";
import { Button, Search, SelectItem, Tag, Tile } from "@carbon/react";
import { Add, Copy, TrashCan } from "@carbon/icons-react";
import { TAG_COLORS, type LibraryProcess, type TagColor } from "@flowplan/core/model/library";
import { AUTO, ERGO, ROLES, STATION_TYPES, type WorkClass } from "@flowplan/core/model/types";
import type { LibraryApi } from "../store/library";
import { PageHead } from "../components/PageHead";
import { Btn, IconBtn, TabBtn } from "../components/Btn";
import { Footnote, SectionLabel } from "../components/analysisKit";
import { NumberField, SelectField, TextAreaField, TextField } from "../components/formKit";

/**
 * The process library, on its own page.
 *
 * It lived in the editor's left drawer for one release, which was wrong twice
 * over: a 320px column is not somewhere you maintain a plant's process data,
 * and burying it inside the editor said the library only exists in service of
 * the cell you happen to have open. It is its own thing — reachable from the
 * front door, useful with no cell open at all, and worth looking things up in.
 *
 * Two panes: the list, and the entry you have selected. Everything about one
 * process is on one screen rather than behind a row disclosure, because that
 * is what "somebody might be interested in using the library only to look
 * something up" needs.
 */

const classTag = (c: WorkClass): "green" | "gray" | "red" => (c === "VA" ? "green" : c === "NNVA" ? "gray" : "red");
const n0 = (v: number | string) => Math.max(0, Number(v) || 0);

export function LibraryPage({ lib }: { lib: LibraryApi }) {
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selId, setSel] = useState<string | null>(null);
  const [editTags, setEditTags] = useState(false);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return lib.processes.filter((p) => {
      if (tagFilter && !p.tags.includes(tagFilter)) return false;
      if (!n) return true;
      return (
        p.name.toLowerCase().includes(n) ||
        p.capabilityId.includes(n) ||
        p.notes.toLowerCase().includes(n) ||
        p.custom.some((c) => c.label.toLowerCase().includes(n) || c.value.toLowerCase().includes(n))
      );
    });
  }, [lib.processes, q, tagFilter]);

  const sel = lib.processes.find((p) => p.id === selId) ?? null;
  const tagOf = (id: string) => lib.tags.find((t) => t.id === id);

  return (
    <div className="page lib-page">
      <PageHead
        title="Process library"
        actions={
          <Btn
            variant="primary"
            size="compact"
            icon={Add}
            onClick={() => {
              const p = lib.add();
              setSel(p.id);
            }}
          >
            New process
          </Btn>
        }
      />

      {lib.processes.length === 0 ? (
        <EmptyLibrary lib={lib} onAdded={setSel} />
      ) : (
        <div className="lib-page__cols">
          <section className="lib-page__list">
            <Search
              id="libp-search"
              size="sm"
              labelText="Find a process"
              placeholder="Name, capability, note or custom field"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onClear={() => setQ("")}
            />
            <div className="lib-page__filters" role="tablist" aria-label="Filter by tag">
              <TabBtn selected={tagFilter === null} onClick={() => setTagFilter(null)}>
                All ({lib.processes.length})
              </TabBtn>
              {lib.tags.map((t) => (
                <TabBtn key={t.id} selected={tagFilter === t.id} onClick={() => setTagFilter(t.id)}>
                  {t.name} ({lib.processes.filter((p) => p.tags.includes(t.id)).length})
                </TabBtn>
              ))}
              <Btn size="compact" variant="ghost" onClick={() => setEditTags((v) => !v)}>
                {editTags ? "Done" : "Edit tags"}
              </Btn>
            </div>

            {editTags ? <TagEditor lib={lib} /> : null}

            <div className="lib-page__rows">
              {shown.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={"lib-page__row" + (p.id === selId ? " on" : "")}
                  aria-pressed={p.id === selId}
                  onClick={() => setSel(p.id)}
                >
                  <span className="lib-page__rowName">{p.name}</span>
                  <span className="lib-page__rowMeta">{p.cycleTimeSec}s</span>
                  <Tag type={classTag(p.classification)} size="sm">
                    {p.classification}
                  </Tag>
                  {p.tags.map((id) => {
                    const t = tagOf(id);
                    return t ? (
                      <Tag key={id} type={t.color} size="sm">
                        {t.name}
                      </Tag>
                    ) : null;
                  })}
                </button>
              ))}
              {shown.length === 0 ? <p className="lib-page__none">Nothing matches that.</p> : null}
            </div>
          </section>

          <section className="lib-page__detail">
            {sel ? (
              <ProcessEditor lib={lib} p={sel} onRemoved={() => setSel(null)} />
            ) : (
              <Tile className="lib-page__hint">
                <p>Select a process to see everything it carries.</p>
                <Footnote>
                  {lib.processes.length} process{lib.processes.length === 1 ? "" : "es"} ·{" "}
                  {lib.tags.length} tag{lib.tags.length === 1 ? "" : "s"}
                </Footnote>
              </Tile>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Nothing here yet — and an honest way out of that, rather than a seed. */
function EmptyLibrary({ lib, onAdded }: { lib: LibraryApi; onAdded: (id: string) => void }) {
  return (
    <Tile className="lib-page__empty">
      <h2 className="lib-page__emptyTitle">Your library is empty</h2>
      <p>
        A process here is a step this plant knows how to do — its cycle, what it costs to own, how much of it binds an
        operator — kept once and reused in every routing and every cell.
      </p>
      <Footnote>
        Nothing is seeded. A library that arrives full of somebody else&rsquo;s generic operations is one you have to
        clean out before you can trust it.
      </Footnote>
      <div className="lib-page__emptyActions">
        <Btn variant="primary" icon={Add} onClick={() => onAdded(lib.add().id)}>
          Add your first process
        </Btn>
        <Btn variant="secondary" onClick={() => lib.importCapabilities()}>
          Import the 12 built-in operations
        </Btn>
      </div>
      <Footnote>
        The import brings in the operations the tool&rsquo;s own inference already recognises — press, weld, leak test
        and so on. They arrive as ordinary entries you own and can edit or delete.
      </Footnote>
    </Tile>
  );
}

function TagEditor({ lib }: { lib: LibraryApi }) {
  const [name, setName] = useState("");
  return (
    <div className="lib-page__tagEdit">
      <SectionLabel>Tags</SectionLabel>
      {lib.tags.map((t) => (
        <div className="lib-page__tagRow" key={t.id}>
          <TextField
            id={"tag-n-" + t.id}
            labelText="Tag name"
            value={t.name}
            onChange={(v) => lib.updateTag(t.id, { name: v })}
          />
          <SelectField
            id={"tag-c-" + t.id}
            labelText="Colour"
            value={t.color}
            options={TAG_COLORS as unknown as string[]}
            onChange={(v) => lib.updateTag(t.id, { color: v as TagColor })}
          />
          <IconBtn size="compact" icon={TrashCan} label={"Delete the " + t.name + " tag"} tooltipPosition="left" onClick={() => lib.removeTag(t.id)} />
        </div>
      ))}
      <div className="lib-page__tagNew">
        <TextField id="tag-new" labelText="New tag" value={name} onChange={setName} placeholder="Joining, Fume extraction, Cell 4…" />
        <Btn
          size="compact"
          icon={Add}
          disabled={!name.trim()}
          onClick={() => {
            lib.addTag(name.trim());
            setName("");
          }}
        >
          Add tag
        </Btn>
      </div>
      <Footnote>Deleting a tag detaches it from every process carrying it. The processes stay.</Footnote>
    </div>
  );
}

function ProcessEditor({ lib, p, onRemoved }: { lib: LibraryApi; p: LibraryProcess; onRemoved: () => void }) {
  const up = (patch: Partial<LibraryProcess>) => lib.update(p.id, patch);
  return (
    <div className="lib-page__editor">
      <div className="lib-page__editorHead">
        <TextField id={"lp-name-" + p.id} labelText="Name" value={p.name} onChange={(v) => up({ name: v })} />
        <IconBtn size="compact" icon={Copy} label={"Duplicate " + p.name} onClick={() => lib.duplicate(p.id)} />
        <IconBtn
          size="compact"
          variant="danger"
          icon={TrashCan}
          label={"Delete " + p.name}
          tooltipPosition="left"
          onClick={() => {
            lib.remove(p.id);
            onRemoved();
          }}
        />
      </div>

      <SectionLabel>Tags</SectionLabel>
      <div className="lib-page__tagPick">
        {lib.tags.length === 0 ? (
          <Footnote>No tags yet. Add some under “Edit tags” to group your processes.</Footnote>
        ) : (
          lib.tags.map((t) => (
            <TabBtn key={t.id} selected={p.tags.includes(t.id)} onClick={() => lib.toggleTag(p.id, t.id)}>
              {t.name}
            </TabBtn>
          ))
        )}
      </div>

      <SectionLabel>What the step is</SectionLabel>
      <div className="lib-page__grid">
        <SelectField id={"lp-role-" + p.id} labelText="Role" value={p.role} options={ROLES} onChange={(v) => up({ role: v as LibraryProcess["role"] })} />
        <SelectField id={"lp-type-" + p.id} labelText="Station type" value={p.type} options={STATION_TYPES} onChange={(v) => up({ type: v as LibraryProcess["type"] })} />
        <SelectField id={"lp-auto-" + p.id} labelText="Automation" value={p.auto} options={AUTO} onChange={(v) => up({ auto: v as LibraryProcess["auto"] })} />
        <SelectField
          id={"lp-cls-" + p.id}
          labelText="Work class"
          value={p.classification}
          onChange={(v) => up({ classification: v as WorkClass })}
        >
          <SelectItem value="VA" text="VA — value add" />
          <SelectItem value="NNVA" text="NNVA — necessary" />
          <SelectItem value="NVA" text="NVA — waste" />
        </SelectField>
      </div>

      <SectionLabel>What it takes</SectionLabel>
      <div className="lib-page__grid">
        <NumberField id={"lp-cyc-" + p.id} label="Cycle (s)" value={p.cycleTimeSec} min={0} onChange={(v) => up({ cycleTimeSec: n0(v) })} />
        <NumberField
          id={"lp-att-" + p.id}
          label="Operator bound (%)"
          value={Math.round(p.attendedFraction * 100)}
          min={0}
          max={100}
          onChange={(v) => up({ attendedFraction: Math.min(1, n0(v) / 100) })}
        />
        <NumberField id={"lp-ops-" + p.id} label="Operators" value={p.operators} min={0} onChange={(v) => up({ operators: n0(v) })} />
        <NumberField id={"lp-chg-" + p.id} label="Changeover (min)" value={p.changeoverMin} min={0} onChange={(v) => up({ changeoverMin: n0(v) })} />
        <SelectField id={"lp-ergo-" + p.id} labelText="Ergonomic risk" value={p.ergoRisk} options={ERGO} onChange={(v) => up({ ergoRisk: v as LibraryProcess["ergoRisk"] })} />
        <NumberField
          id={"lp-scrap-" + p.id}
          label="Scrap (%)"
          value={+(p.scrapRate * 100).toFixed(2)}
          min={0}
          max={100}
          onChange={(v) => up({ scrapRate: Math.min(1, n0(v) / 100) })}
        />
      </div>

      <SectionLabel>What it costs and occupies</SectionLabel>
      <div className="lib-page__grid">
        <NumberField id={"lp-capex-" + p.id} label="Capex" value={p.capex} min={0} onChange={(v) => up({ capex: n0(v) })} />
        <NumberField id={"lp-acap-" + p.id} label="Cost to automate" value={p.automationCapex} min={0} onChange={(v) => up({ automationCapex: n0(v) })} />
        <NumberField id={"lp-kw-" + p.id} label="Power (kW)" value={p.energyKw} min={0} onChange={(v) => up({ energyKw: n0(v) })} />
        <NumberField id={"lp-fw-" + p.id} label="Footprint W" value={p.footprintW} min={1} onChange={(v) => up({ footprintW: Math.max(1, n0(v)) })} />
        <NumberField id={"lp-fh-" + p.id} label="Footprint H" value={p.footprintH} min={1} onChange={(v) => up({ footprintH: Math.max(1, n0(v)) })} />
        <TextField
          id={"lp-util-" + p.id}
          labelText="Utilities"
          value={p.utilities.join(", ")}
          helperText="Comma separated"
          onChange={(v) => up({ utilities: v.split(",").map((s) => s.trim()).filter(Boolean) })}
        />
      </div>

      <TextAreaField id={"lp-notes-" + p.id} labelText="Notes" value={p.notes} rows={2} onChange={(v) => up({ notes: v })} />

      <SectionLabel>Your own fields</SectionLabel>
      <Footnote>
        Anything this plant tracks that the tool does not model — tool number, NC programme, supplier, approval. Stored
        and carried onto the stations you place from this entry; never interpreted.
      </Footnote>
      {p.custom.map((c) => (
        <div className="lib-page__customRow" key={c.id}>
          <TextField id={"cf-l-" + c.id} labelText="Field" value={c.label} placeholder="Tool no." onChange={(v) => lib.updateField(p.id, c.id, { label: v })} />
          <TextField id={"cf-v-" + c.id} labelText="Value" value={c.value} placeholder="T-4471" onChange={(v) => lib.updateField(p.id, c.id, { value: v })} />
          <IconBtn size="compact" icon={TrashCan} label={"Remove the " + (c.label || "empty") + " field"} tooltipPosition="left" onClick={() => lib.removeField(p.id, c.id)} />
        </div>
      ))}
      <Button kind="ghost" size="sm" renderIcon={Add} onClick={() => lib.addField(p.id)}>
        Add a field
      </Button>

      <Footnote>
        Capability <code>{p.capabilityId}</code> — how the engine classifies this step when it appears in a routing.
      </Footnote>
    </div>
  );
}
