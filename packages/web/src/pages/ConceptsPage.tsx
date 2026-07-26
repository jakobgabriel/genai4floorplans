import { useState } from "react";
import { Button, NumberInput, Select, SelectItem, Tag, TextArea, TextInput, Tile } from "@carbon/react";
import { Add, Copy, TrashCan } from "@carbon/icons-react";
import { byKind, rankConcepts, type ConceptProfile } from "@flowplan/core/engine/concepts";
import type { CellForm } from "@flowplan/core/engine/topology";
import { AUTO, ERGO, STATION_TYPES, TRANSPORT } from "@flowplan/core/model/types";
import type { ConceptApi } from "../store/concepts";
import { PageHead } from "../components/PageHead";
import { Btn } from "../components/Btn";
import { DashCard, KpiTile } from "../components/dashKit";

// The concept catalog, out in the open. Every candidate the sweep ranks is
// built from one of these profiles — the cycle multiplier, the manning, the
// capex per station, the volume band. Those numbers decide the answer, so they
// are a visible, editable page rather than a hidden constant.
//
// It wears the same airy `.bi` dashboard language as the report and the
// recommend page: a card shell, a KPI band on the selected profile, and a
// `.bi-tbl` for the volume ladder.

const FORMS: CellForm[] = ["I", "U", "L", "S", "W", "O"];
const FORM_LABELS: Record<CellForm, string> = {
  I: "Straight line",
  U: "U-cell",
  L: "L-cell",
  S: "Serpentine",
  W: "Workshop",
  O: "Loop",
};
const n0 = (v: number | string) => Math.max(0, Number(v) || 0);
const num = (n: number) => Math.round(n).toLocaleString();

export function ConceptsPage({ api }: { api: ConceptApi }) {
  const [selKind, setSel] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const sel = api.concepts.find((c) => c.kind === selKind) ?? null;

  return (
    <div className="page bi">
      <PageHead
        title="Manufacturing concepts"
        actions={
          <>
            <Btn variant="ghost" size="compact" onClick={() => api.restoreDefaults()}>
              Restore defaults
            </Btn>
            <Btn variant="primary" size="compact" icon={Add} onClick={() => setSel(api.add(newLabel.trim() || "New concept").kind)}>
              New concept
            </Btn>
          </>
        }
      />

      {api.concepts.length === 0 ? (
        <Tile className="bi-card bi-card--wide rep__empty">
          <h2 className="rep__emptyTitle">No concepts</h2>
          <p>Concept comparison needs at least one profile.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn variant="primary" onClick={() => api.restoreDefaults()}>
              Restore defaults
            </Btn>
            <Btn variant="secondary" onClick={() => setSel(api.add("New concept").kind)}>
              New concept
            </Btn>
          </div>
        </Tile>
      ) : (
        <div className="cc__cols">
          <DashCard
            title="Catalog"
            lead={api.isPristine ? "As shipped" : "Edited"}
            wide={false}
          >
            <div className="cc__rows">
              {api.concepts.map((c) => (
                <button
                  type="button"
                  key={c.kind}
                  className={"cc__row" + (c.kind === selKind ? " on" : "")}
                  aria-pressed={c.kind === selKind}
                  onClick={() => setSel(c.kind)}
                >
                  <span className="cc__rowName">{c.label}</span>
                  <span className="cc__rowMeta">
                    {num(c.viableVolume[0])}–{num(c.viableVolume[1])}/yr
                  </span>
                  <Tag type="gray" size="sm">
                    {c.forms.length} form{c.forms.length === 1 ? "" : "s"}
                  </Tag>
                </button>
              ))}
            </div>
            <div className="cc__new">
              <TextInput
                id="concept-new"
                labelText="New concept"
                size="sm"
                value={newLabel}
                placeholder="Robot cell, Chaku-chaku…"
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <Button
                size="sm"
                renderIcon={Add}
                disabled={!newLabel.trim()}
                onClick={() => {
                  setSel(api.add(newLabel.trim()).kind);
                  setNewLabel("");
                }}
              >
                Add
              </Button>
            </div>
          </DashCard>

          {sel ? (
            <ConceptEditor api={api} c={sel} onRemoved={() => setSel(null)} />
          ) : (
            <VolumeLadder api={api} />
          )}
        </div>
      )}
    </div>
  );
}

/** Which concept the sweep would favour at each order of magnitude. */
function VolumeLadder({ api }: { api: ConceptApi }) {
  const catalog = byKind(api.concepts);
  const rungs = [1000, 10000, 100000, 1000000];
  return (
    <DashCard title="Best fit by volume" lead="Fit: 100 inside the band, 0 one decade outside." wide={false}>
      <div className="rep__scroll">
        <table className="bi-tbl">
          <thead>
            <tr>
              <th>Annual volume</th>
              <th>Best fit</th>
              <th className="bi-tbl__num">Fit</th>
            </tr>
          </thead>
          <tbody>
            {rungs.map((v) => {
              const top = rankConcepts(v, catalog)[0];
              return (
                <tr key={v}>
                  <td className="bi-tbl__num" style={{ textAlign: "left" }}>
                    {num(v)}
                  </td>
                  <td>{top ? catalog[top.kind].label : "—"}</td>
                  <td className="bi-tbl__num">{top ? top.fit : 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DashCard>
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
    <DashCard
      title={c.label}
      wide={false}
      actions={
        <>
          <Button hasIconOnly size="sm" kind="ghost" renderIcon={Copy} iconDescription={"Duplicate " + c.label} onClick={() => api.duplicate(c.kind)} />
          <Button
            hasIconOnly
            size="sm"
            kind="ghost"
            renderIcon={TrashCan}
            iconDescription={"Delete " + c.label}
            onClick={() => {
              api.remove(c.kind);
              onRemoved();
            }}
          />
        </>
      }
    >
      {/* the numbers that decide the answer, read at a glance before editing */}
      <div className="bi-kpis" style={{ marginBottom: "var(--sp-05)" }}>
        <KpiTile label="Volume band" value={`${num(c.viableVolume[0])}–${num(c.viableVolume[1])}`} sub="parts / yr" />
        <KpiTile label="Capex / station" value={num(c.capexPerStation)} />
        <KpiTile label="Cycle ×" value={c.cycleFactor} sub="of manual time" />
        <KpiTile label="Operators" value={c.operatorsPerStation} sub="per station" />
      </div>

      <div className="cc__editor">
        <TextInput id={"c-label-" + c.kind} labelText="Name" value={c.label} onChange={(e) => up({ label: e.target.value })} />
        <TextArea id={"c-blurb-" + c.kind} labelText="Description" value={c.blurb} rows={2} onChange={(e) => up({ blurb: e.target.value })} />

        <h4 className="cc__section">Volume band</h4>
        <div className="cc__grid">
          <NumberInput
            id={"c-lo-" + c.kind}
            label="Viable from (parts/yr)"
            value={c.viableVolume[0]}
            min={0}
            helperText="Fit tapers below"
            onChange={(_e, { value }) => up({ viableVolume: [n0(value), c.viableVolume[1]] })}
          />
          <NumberInput
            id={"c-hi-" + c.kind}
            label="Viable to (parts/yr)"
            value={c.viableVolume[1]}
            min={0}
            onChange={(_e, { value }) => up({ viableVolume: [c.viableVolume[0], n0(value)] })}
          />
        </div>

        <h4 className="cc__section">Layout forms</h4>
        <div className="cc__forms" role="group" aria-label="Layout forms">
          {FORMS.map((f) => (
            <Button key={f} size="sm" kind={c.forms.includes(f) ? "primary" : "tertiary"} onClick={() => toggleForm(f)}>
              {FORM_LABELS[f]}
            </Button>
          ))}
        </div>

        <h4 className="cc__section">Operation</h4>
        <div className="cc__grid">
          <Select id={"c-auto-" + c.kind} labelText="Automation" value={c.auto} onChange={(e) => up({ auto: e.target.value as ConceptProfile["auto"] })}>
            {AUTO.map((o) => <SelectItem key={o} value={o} text={o} />)}
          </Select>
          <Select id={"c-type-" + c.kind} labelText="Station type" value={c.stationType} onChange={(e) => up({ stationType: e.target.value as ConceptProfile["stationType"] })}>
            {STATION_TYPES.map((o) => <SelectItem key={o} value={o} text={o} />)}
          </Select>
          <Select id={"c-trans-" + c.kind} labelText="Transport" value={c.transport} onChange={(e) => up({ transport: e.target.value as ConceptProfile["transport"] })}>
            {TRANSPORT.map((o) => <SelectItem key={o} value={o} text={o} />)}
          </Select>
          <Select id={"c-ergo-" + c.kind} labelText="Ergonomic risk" value={c.ergoRisk} onChange={(e) => up({ ergoRisk: e.target.value as ConceptProfile["ergoRisk"] })}>
            {ERGO.map((o) => <SelectItem key={o} value={o} text={o} />)}
          </Select>
          <NumberInput id={"c-ops-" + c.kind} label="Operators per station" value={c.operatorsPerStation} min={0} step={0.5} onChange={(_e, { value }) => up({ operatorsPerStation: n0(value) })} />
          <Select id={"c-par-" + c.kind} labelText="Parallel lanes" value={c.allowsParallel ? "yes" : "no"} onChange={(e) => up({ allowsParallel: e.target.value === "yes" })}>
            <SelectItem value="yes" text="May duplicate a step to reach takt" />
            <SelectItem value="no" text="One lane only" />
          </Select>
        </div>

        <h4 className="cc__section">Cost model</h4>
        <div className="cc__grid">
          <NumberInput id={"c-cf-" + c.kind} label="Cycle multiplier" value={c.cycleFactor} min={0} step={0.05} helperText="× manual time" onChange={(_e, { value }) => up({ cycleFactor: n0(value) })} />
          <NumberInput id={"c-hs-" + c.kind} label="Handling share (%)" value={Math.round(c.handlingShare * 100)} min={0} max={100} helperText="of cycle" onChange={(_e, { value }) => up({ handlingShare: Math.min(1, n0(value) / 100) })} />
          <NumberInput id={"c-capex-" + c.kind} label="Capex per station" value={c.capexPerStation} min={0} onChange={(_e, { value }) => up({ capexPerStation: n0(value) })} />
          <NumberInput id={"c-kw-" + c.kind} label="Power per station (kW)" value={c.energyKw} min={0} onChange={(_e, { value }) => up({ energyKw: n0(value) })} />
          <NumberInput id={"c-chg-" + c.kind} label="Changeover (min)" value={c.changeoverMin} min={0} onChange={(_e, { value }) => up({ changeoverMin: n0(value) })} />
        </div>

        <h4 className="cc__section">Custom fields</h4>
        {(c.custom ?? []).map((f) => (
          <div className="cc__customRow" key={f.id}>
            <TextInput id={"cf-l-" + f.id} labelText="Field" value={f.label} placeholder="Standard no." onChange={(e) => api.updateField(c.kind, f.id, { label: e.target.value })} />
            <TextInput id={"cf-v-" + f.id} labelText="Value" value={f.value} placeholder="WN-2024-11" onChange={(e) => api.updateField(c.kind, f.id, { value: e.target.value })} />
            <Button hasIconOnly size="md" kind="ghost" renderIcon={TrashCan} iconDescription={"Remove the " + (f.label || "empty") + " field"} onClick={() => api.removeField(c.kind, f.id)} />
          </div>
        ))}
        <Button kind="ghost" size="sm" renderIcon={Add} onClick={() => api.addField(c.kind)}>
          Add a field
        </Button>
      </div>
    </DashCard>
  );
}
