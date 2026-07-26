import { useMemo, useState } from "react";
import { ComboBox, Search, SelectItem, Tag, Tile } from "@carbon/react";
import { Add, Copy, TrashCan } from "@carbon/icons-react";
import { TAG_COLORS, type LibraryProcess, type LibraryTag, type TagColor } from "@flowplan/core/model/library";
import { AUTO, ERGO, ROLES, STATION_TYPES, type WorkClass } from "@flowplan/core/model/types";
import type { LibraryApi } from "../store/library";
import { PageHead } from "../components/PageHead";
import { Btn, IconBtn, TabBtn } from "../components/Btn";
import { Footnote, SectionLabel } from "../components/analysisKit";
import { CustomFields } from "../components/CustomFields";
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
        <EmptyLibrary lib={lib} />
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
                <p>Select a process.</p>
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

/** Nothing here yet. Nothing is seeded; the built-ins are an explicit import. */
function EmptyLibrary({ lib }: { lib: LibraryApi }) {
  return (
    <Tile className="lib-page__empty">
      <h2 className="lib-page__emptyTitle">Library is empty</h2>
      <p>A process carries its cycle, manning, changeover, capex and footprint, reused across routings and cells.</p>
      {/* "New process" is already the page's primary action in the header;
          repeating it here would be two identical buttons on one screen. */}
      <div className="lib-page__emptyActions">
        <Btn variant="secondary" onClick={() => lib.importCapabilities()}>
          Import 12 built-in operations
        </Btn>
      </div>
      <Footnote>Built-ins are the operations the step-name inference recognises. Imported as editable entries.</Footnote>
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
        <TextField id="tag-new" labelText="New tag" value={name} onChange={setName} placeholder="Joining, Fume extraction…" />
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
      <Footnote>Deleting a tag detaches it from every process; the processes remain.</Footnote>
    </div>
  );
}

/**
 * Assign tags to a process at any scale.
 *
 * A flat row of toggle chips does not survive a company-wide taxonomy of
 * hundreds of tags. This is a search-as-you-type box: the assigned tags sit
 * above as dismissible chips, and the combo box filters the rest and offers to
 * create a brand-new tag inline when nothing matches.
 */
const CREATE_TAG = "__create-tag__";
function TagPicker({ lib, p }: { lib: LibraryApi; p: LibraryProcess }) {
  const [query, setQuery] = useState("");
  // Bumped after each pick so the combo box remounts with an empty input.
  const [resetKey, setResetKey] = useState(0);

  const selected = p.tags.map((id) => lib.tags.find((t) => t.id === id)).filter((t): t is LibraryTag => !!t);
  const q = query.trim();
  const ql = q.toLowerCase();
  const unassigned = lib.tags.filter((t) => !p.tags.includes(t.id));
  const matches = ql ? unassigned.filter((t) => t.name.toLowerCase().includes(ql)) : unassigned;
  const exists = lib.tags.some((t) => t.name.toLowerCase() === ql);
  const items: Array<{ id: string; name: string }> = [
    ...(q && !exists ? [{ id: CREATE_TAG, name: `Create “${q}”` }] : []),
    ...matches.slice(0, 50).map((t) => ({ id: t.id, name: t.name })),
  ];

  const pick = (item: { id: string } | null | undefined) => {
    if (!item) return;
    const id = item.id === CREATE_TAG ? lib.addTag(q).id : item.id;
    lib.toggleTag(p.id, id);
    setQuery("");
    setResetKey((k) => k + 1);
  };

  return (
    <div className="tagpicker">
      {selected.length > 0 ? (
        <div className="tagpicker__chips">
          {selected.map((t) => (
            <Tag key={t.id} type={t.color} size="sm" filter onClose={() => lib.toggleTag(p.id, t.id)} title={"Remove " + t.name}>
              {t.name}
            </Tag>
          ))}
        </div>
      ) : null}
      <ComboBox
        key={resetKey}
        id={"tagpick-" + p.id}
        size="sm"
        items={items}
        itemToString={(t) => (t ? t.name : "")}
        placeholder={lib.tags.length ? "Search tags or type to create…" : "Type a tag name to create it…"}
        titleText="Add a tag"
        shouldFilterItem={() => true}
        onInputChange={(v) => setQuery(v ?? "")}
        onChange={({ selectedItem }) => pick(selectedItem)}
        selectedItem={null}
      />
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
      <TagPicker lib={lib} p={p} />

      <SectionLabel>Classification</SectionLabel>
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

      <SectionLabel>Time &amp; manning</SectionLabel>
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

      <SectionLabel>Cost &amp; footprint</SectionLabel>
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

      <Footnote>Not interpreted by the tool. Carried onto stations placed from this entry.</Footnote>
      <CustomFields
        fields={p.custom}
        onAdd={() => lib.addField(p.id)}
        onUpdate={(id, patch) => lib.updateField(p.id, id, patch)}
        onRemove={(id) => lib.removeField(p.id, id)}
      />

      <Footnote>
        Capability: <code>{p.capabilityId}</code>
      </Footnote>
    </div>
  );
}
