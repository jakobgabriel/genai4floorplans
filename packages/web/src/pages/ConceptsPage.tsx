import { useState } from "react";
import { Button, SelectItem, Tag, Tile } from "@carbon/react";
import { Add, Copy, TrashCan } from "@carbon/icons-react";
import { rankConcepts, byKind, type ConceptProfile } from "@flowplan/core/engine/concepts";
import { FORM_LABELS, type CellForm } from "@flowplan/core/engine/templates";
import { AUTO, ERGO, STATION_TYPES, TRANSPORT } from "@flowplan/core/model/types";
import type { ConceptApi } from "../store/concepts";
import { PageHead } from "../components/PageHead";
import { Btn, IconBtn, TabBtn } from "../components/Btn";
import { Footnote, SectionLabel } from "../components/analysisKit";
import { NumberField, SelectField, TextAreaField, TextField } from "../components/formKit";

/**
 * The concept catalog, out in the open.
 *
 * Every candidate the tool ranks is built from one of these profiles: the
 * cycle-time multiplier, the manning, the capex per station, the volume band
 * it is judged against. Those numbers decided the answer, and they lived in a
 * TypeScript constant nobody using the app could see — so the comparison
 * presented itself as a result when it was partly a set of assumptions.
 *
 * This is that constant, as a page. Same shape as the process library on
 * purpose: they are the two catalogs the planning process reads from, and they
 * sit side by side rather than one being buried inside the other.
 */

const FORMS: CellForm[] = ["I", "U", "L", "S", "W"];
const n0 = (v: number | string) => Math.max(0, Number(v) || 0);
const num = (n: number) => Math.round(n).toLocaleString();

export function ConceptsPage({ api }: { api: ConceptApi }) {
  const [selKind, setSel] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const sel = api.concepts.find((c) => c.kind === selKind) ?? null;

  return (
    <div className="page lib-page">
      <PageHead
        title="Manufacturing concepts"
        actions={
          <>
            <Btn size="compact" variant="ghost" onClick={() => api.restoreDefaults()}>
              Restore defaults
            </Btn>
            <Btn
              variant="primary"
              size="compact"
              icon={Add}
              onClick={() => setSel(api.add(newLabel.trim() || "New concept").kind)}
            >
              New concept
            </Btn>
          </>
        }
      />

      {api.concepts.length === 0 ? (
        <Tile className="lib-page__empty">
          <h2 className="lib-page__emptyTitle">No concepts</h2>
          <p>Concept comparison needs at least one profile.</p>
          <div className="lib-page__emptyActions">
            <Btn variant="primary" onClick={() => api.restoreDefaults()}>
              Restore defaults
            </Btn>
            <Btn variant="secondary" onClick={() => setSel(api.add("New concept").kind)}>
              New concept
            </Btn>
          </div>
        </Tile>
      ) : (
        <div className="lib-page__cols">
          <section className="lib-page__list">
            <div className="lib-page__rows">
              {api.concepts.map((c) => (
                <button
                  type="button"
                  key={c.kind}
                  className={"lib-page__row" + (c.kind === selKind ? " on" : "")}
                  aria-pressed={c.kind === selKind}
                  onClick={() => setSel(c.kind)}
                >
                  <span className="lib-page__rowName">{c.label}</span>
                  <span className="lib-page__rowMeta">
                    {num(c.viableVolume[0])}–{num(c.viableVolume[1])}/yr
                  </span>
                  <Tag type="gray" size="sm">
                    {c.forms.length} form{c.forms.length === 1 ? "" : "s"}
                  </Tag>
                </button>
              ))}
            </div>
            <div className="lib-page__tagNew">
              <TextField
                id="concept-new"
                labelText="New concept"
                value={newLabel}
                placeholder="Robot cell, Chaku-chaku…"
                onChange={setNewLabel}
              />
              <Btn
                size="compact"
                icon={Add}
                disabled={!newLabel.trim()}
                onClick={() => {
                  setSel(api.add(newLabel.trim()).kind);
                  setNewLabel("");
                }}
              >
                Add
              </Btn>
            </div>
            <Footnote>{api.isPristine ? "As shipped" : "Edited"}</Footnote>
          </section>

          <section className="lib-page__detail">
            {sel ? (
              <ConceptEditor api={api} c={sel} onRemoved={() => setSel(null)} />
            ) : (
              <Tile className="lib-page__hint">
                <VolumeLadder api={api} />
              </Tile>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Which concept the tool would favour at each order of magnitude. */
function VolumeLadder({ api }: { api: ConceptApi }) {
  const catalog = byKind(api.concepts);
  const rungs = [1000, 10000, 100000, 1000000];
  return (
    <>
      <SectionLabel>Best fit by volume</SectionLabel>
      <table className="rep__table">
        <thead>
          <tr>
            <th>Annual volume</th>
            <th>Best fit</th>
            <th className="rep__numCol">Fit</th>
          </tr>
        </thead>
        <tbody>
          {rungs.map((v) => {
            const top = rankConcepts(v, catalog)[0];
            return (
              <tr key={v}>
                <td>{num(v)}</td>
                <td>{top ? catalog[top.kind].label : "—"}</td>
                <td className="rep__numCol">{top ? top.fit : 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Footnote>Fit: 100 inside the band, 0 one decade outside.</Footnote>
    </>
  );
}

function ConceptEditor({ api, c, onRemoved }: { api: ConceptApi; c: ConceptProfile; onRemoved: () => void }) {
  const up = (patch: Partial<ConceptProfile>) => api.update(c.kind, patch);
  const toggleForm = (f: CellForm) => {
    const next = c.forms.includes(f) ? c.forms.filter((x) => x !== f) : c.forms.concat([f]);
    // A concept with no form generates nothing at all, which reads as the
    // concept having silently vanished from the comparison.
    if (next.length) up({ forms: next });
  };

  return (
    <div className="lib-page__editor">
      <div className="lib-page__editorHead">
        <TextField id={"c-label-" + c.kind} labelText="Name" value={c.label} onChange={(v) => up({ label: v })} />
        <IconBtn size="compact" icon={Copy} label={"Duplicate " + c.label} onClick={() => api.duplicate(c.kind)} />
        <IconBtn
          size="compact"
          variant="danger"
          icon={TrashCan}
          label={"Delete " + c.label}
          tooltipPosition="left"
          onClick={() => {
            api.remove(c.kind);
            onRemoved();
          }}
        />
      </div>

      <TextAreaField
        id={"c-blurb-" + c.kind}
        labelText="Description"
        value={c.blurb}
        rows={2}
        onChange={(v) => up({ blurb: v })}
      />

      <SectionLabel>Volume band</SectionLabel>
      <div className="lib-page__grid">
        <NumberField
          id={"c-lo-" + c.kind}
          label="Viable from (parts/yr)"
          value={c.viableVolume[0]}
          min={0}
          helperText="Fit tapers below"
          onChange={(v) => up({ viableVolume: [n0(v), c.viableVolume[1]] })}
        />
        <NumberField
          id={"c-hi-" + c.kind}
          label="Viable to (parts/yr)"
          value={c.viableVolume[1]}
          min={0}
          onChange={(v) => up({ viableVolume: [c.viableVolume[0], n0(v)] })}
        />
      </div>
      <div>
        <SectionLabel>Layout forms</SectionLabel>
        <div className="lib-page__tagPick" role="group" aria-label="Layout forms">
          {FORMS.map((f) => (
            <TabBtn key={f} selected={c.forms.includes(f)} onClick={() => toggleForm(f)}>
              {FORM_LABELS[f]}
            </TabBtn>
          ))}
        </div>
        <Footnote>One candidate per form.</Footnote>
      </div>

      <SectionLabel>Operation</SectionLabel>
      <div className="lib-page__grid">
        <SelectField id={"c-auto-" + c.kind} labelText="Automation" value={c.auto} options={AUTO} onChange={(v) => up({ auto: v as ConceptProfile["auto"] })} />
        <SelectField id={"c-type-" + c.kind} labelText="Station type" value={c.stationType} options={STATION_TYPES} onChange={(v) => up({ stationType: v as ConceptProfile["stationType"] })} />
        <SelectField id={"c-trans-" + c.kind} labelText="Transport" value={c.transport} options={TRANSPORT} onChange={(v) => up({ transport: v as ConceptProfile["transport"] })} />
        <SelectField id={"c-ergo-" + c.kind} labelText="Ergonomic risk" value={c.ergoRisk} options={ERGO} onChange={(v) => up({ ergoRisk: v as ConceptProfile["ergoRisk"] })} />
        <NumberField
          id={"c-ops-" + c.kind}
          label="Operators per station"
          value={c.operatorsPerStation}
          min={0}
          step={0.5}
          onChange={(v) => up({ operatorsPerStation: n0(v) })}
        />
        <SelectField
          id={"c-par-" + c.kind}
          labelText="Parallel lanes"
          value={c.allowsParallel ? "yes" : "no"}
          onChange={(v) => up({ allowsParallel: v === "yes" })}
        >
          <SelectItem value="yes" text="May duplicate a step to reach takt" />
          <SelectItem value="no" text="One lane only" />
        </SelectField>
      </div>

      <SectionLabel>Cost model</SectionLabel>
      <div className="lib-page__grid">
        <NumberField
          id={"c-cf-" + c.kind}
          label="Cycle multiplier"
          value={c.cycleFactor}
          min={0}
          step={0.05}
          helperText="× manual time"
          onChange={(v) => up({ cycleFactor: n0(v) })}
        />
        <NumberField
          id={"c-hs-" + c.kind}
          label="Handling share (%)"
          value={Math.round(c.handlingShare * 100)}
          min={0}
          max={100}
          helperText="of cycle"
          onChange={(v) => up({ handlingShare: Math.min(1, n0(v) / 100) })}
        />
        <NumberField id={"c-capex-" + c.kind} label="Capex per station" value={c.capexPerStation} min={0} onChange={(v) => up({ capexPerStation: n0(v) })} />
        <NumberField id={"c-kw-" + c.kind} label="Power per station (kW)" value={c.energyKw} min={0} onChange={(v) => up({ energyKw: n0(v) })} />
        <NumberField id={"c-chg-" + c.kind} label="Changeover (min)" value={c.changeoverMin} min={0} onChange={(v) => up({ changeoverMin: n0(v) })} />
      </div>

      <SectionLabel>Custom fields</SectionLabel>
      {(c.custom ?? []).map((f) => (
        <div className="lib-page__customRow" key={f.id}>
          <TextField id={"cf-l-" + f.id} labelText="Field" value={f.label} placeholder="Standard no." onChange={(v) => api.updateField(c.kind, f.id, { label: v })} />
          <TextField id={"cf-v-" + f.id} labelText="Value" value={f.value} placeholder="WN-2024-11" onChange={(v) => api.updateField(c.kind, f.id, { value: v })} />
          <IconBtn size="compact" icon={TrashCan} label={"Remove the " + (f.label || "empty") + " field"} tooltipPosition="left" onClick={() => api.removeField(c.kind, f.id)} />
        </div>
      ))}
      <Button kind="ghost" size="sm" renderIcon={Add} onClick={() => api.addField(c.kind)}>
        Add a field
      </Button>
    </div>
  );
}
