import { useState } from "react";
import { Button, Tab, TabList, Tabs } from "@carbon/react";
import { Add, ArrowLeft, TrashCan } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { navigate } from "../store/useHashRoute";
import type { useLibrary } from "../store/library";
import type { useSubflows } from "../store/subflows";
import {
  PROCESS_CATEGORIES,
  catalogStationPatch,
  type ProcessCatalogEntry,
  type ProcessCategory,
} from "@flowplan/core/model/catalog";
import { STATION_TYPES, DATA_QUALITIES } from "@flowplan/core/model/types";
import { makeStation } from "@flowplan/core/store/reducer";
import { Field, useToast } from "../components/ui";
import { QualityMark } from "../components/confidence";
import { CatalogEntryDoc, StationDoc } from "../components/ElementDoc";
import { NODE_DND_TYPE } from "../components/PaletteBar";
import { TEXTD, TYPE_COL, TEAL } from "../components/colors";

type Detail = "edit" | "doc";
type Selection = { kind: "entry"; id: string } | { kind: "subflow"; id: string } | null;

// The process library — a global catalog of standard building blocks, kept in
// the node-RED idiom (a compact, draggable list) rather than a spreadsheet. The
// detail pane documents every field of the selected element, edits it, and lets
// the user author non-predefined elements. A second section lists the user's
// grouped/subflow elements. Absorbs the PAUL "Catalog" fields plus the
// blueprint's building blocks; placing an entry authors a station pre-filled
// with its standards.
export function LibraryPage({ api, subflows, library }: { api: FlowPlanApi; subflows: ReturnType<typeof useSubflows>; library: ReturnType<typeof useLibrary> }) {
  const { entries, add, update, remove, resetToSeed } = library;
  const { toast } = useToast();
  const [filter, setFilter] = useState<ProcessCategory | "all">("all");
  const [sel, setSel] = useState<Selection>(null);
  const [detail, setDetail] = useState<Detail>("edit");

  const shown = entries.filter((e) => filter === "all" || e.category === filter);
  const selEntry = sel?.kind === "entry" ? entries.find((e) => e.id === sel.id) ?? null : null;
  const selSub = sel?.kind === "subflow" ? subflows.subflows.find((s) => s.id === sel.id) ?? null : null;

  function addToCell(e: ProcessCatalogEntry) {
    const base = makeStation(api.model);
    api.commit({ type: "ADD_STATION", station: { ...base, ...(catalogStationPatch(e) as object) } });
    toast(`Added ${e.name} to the layout`);
    navigate("/");
  }

  function insertSubflow(id: string) {
    const sf = subflows.subflows.find((s) => s.id === id);
    if (!sf) return;
    const x = Math.max(0, Math.floor(api.model.gridW / 2 - sf.w / 2));
    const y = Math.max(0, Math.floor(api.model.gridH / 2 - sf.h / 2));
    api.commit({ type: "INSERT_SUBFLOW", stations: sf.stations, flows: sf.flows, x, y });
    toast(`Inserted “${sf.name}” (${sf.stations.length} steps)`);
    navigate("/");
  }

  function newEntry() {
    const id = `cat-${Math.random().toString(36).slice(2, 8)}`;
    add({ id, name: "New element", category: filter === "all" ? "assembly" : filter, stationType: "machine", cycleTimeSec: 30, dataQuality: "estimated", attendedFraction: 1, w: 3, h: 2, custom: true });
    setSel({ kind: "entry", id });
    setDetail("edit");
  }

  return (
    <div className="page">
      <div className="page-head">
        <Button size="sm" kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate("/")}>Editor</Button>
        <h1 className="page-title">Process library</h1>
        <div className="spacer" />
        <Button size="sm" kind="tertiary" renderIcon={Add} onClick={newEntry}>New element</Button>
        <Button size="sm" kind="tertiary" onClick={() => { if (confirm("Reset the library to the seed catalog? Custom elements are lost.")) { resetToSeed(); setSel(null); } }}>Reset to seed</Button>
      </div>

      <p style={{ fontSize: 12, color: TEXTD, maxWidth: 640, marginTop: 0 }}>
        Standard building blocks with known characteristics and defined interfaces.
        A process declares the <strong>capability</strong> it provides — matched N:M
        to resources, never a 1:1 workcenter. Drag one onto the canvas, or select it
        to read its full data sheet, edit it, or author your own.
      </p>

      <div className="lib-layout">
        {/* Master: compact, draggable node list + grouped elements. */}
        <div className="lib-list">
          <div className="explorer-actions" style={{ marginBottom: 10, flexWrap: "wrap" }}>
            {(["all", ...PROCESS_CATEGORIES] as const).map((c) => (
              <Button key={c} size="sm" kind={filter === c ? "primary" : "tertiary"} onClick={() => setFilter(c)}>
                {c}
              </Button>
            ))}
          </div>
          {shown.map((e) => (
            <div
              key={e.id}
              className={"lib-item" + (sel?.kind === "entry" && sel.id === e.id ? " on" : "")}
              draggable
              onDragStart={(ev) => {
                ev.dataTransfer.setData(NODE_DND_TYPE, "lib:" + e.id);
                ev.dataTransfer.setData("text/plain", e.name);
                ev.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => { setSel({ kind: "entry", id: e.id }); setDetail("edit"); }}
              title="Click to inspect · drag onto the canvas"
            >
              <span className="lib-swatch" style={{ background: TYPE_COL[e.stationType] }} />
              <span className="lib-item__name">{e.name}</span>
              {e.custom ? <span className="lib-tag">custom</span> : null}
              <span className="lib-item__meta">{e.cycleTimeSec}s</span>
            </div>
          ))}

          <div className="lab" style={{ margin: "16px 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
            Grouped elements
            <span style={{ fontSize: 10.5, color: TEXTD, textTransform: "none", letterSpacing: 0 }}>· made with ⧉ Group on the canvas</span>
          </div>
          {subflows.subflows.length === 0 ? (
            <div style={{ fontSize: 11, color: TEXTD }}>None yet. On the canvas, use ⧉ Group to draw around steps and save them as a reusable element.</div>
          ) : (
            subflows.subflows.map((sf) => (
              <div
                key={sf.id}
                className={"lib-item" + (sel?.kind === "subflow" && sel.id === sf.id ? " on" : "")}
                onClick={() => { setSel({ kind: "subflow", id: sf.id }); setDetail("doc"); }}
                title="Grouped element"
              >
                <span className="lib-swatch" style={{ background: TEAL }} />
                <span className="lib-item__name">{sf.name}</span>
                <span className="lib-item__meta">{sf.stations.length} steps</span>
              </div>
            ))
          )}
        </div>

        {/* Detail: documentation + edit for the selection. */}
        <div className="lib-detail">
          {selEntry ? (
            <>
              <div style={{ marginBottom: "var(--cds-spacing-05)" }}>
                <Tabs selectedIndex={detail === "doc" ? 1 : 0} onChange={({ selectedIndex }: { selectedIndex: number }) => setDetail(selectedIndex === 1 ? "doc" : "edit")}>
                  <TabList aria-label="Library entry sections" contained>
                    <Tab>Edit</Tab>
                    <Tab>Documentation</Tab>
                  </TabList>
                </Tabs>
              </div>
              {detail === "doc" ? (
                <CatalogEntryDoc entry={selEntry} provenance={selEntry.custom ? "custom" : "builtin"} />
              ) : (
                <EntryEditor entry={selEntry} update={update} />
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <Button size="sm" kind="primary" style={{ flex: 1 }} onClick={() => addToCell(selEntry)}>Add to layout</Button>
                <Button size="sm" kind="danger--tertiary" renderIcon={TrashCan} hasIconOnly={false} onClick={() => { remove(selEntry.id); setSel(null); }}>Delete</Button>
              </div>
            </>
          ) : selSub ? (
            <>
              <div className="lab" style={{ marginBottom: 8 }}>Grouped element</div>
              {/* A grouped element documents its members and aggregate footprint. */}
              <div className="element-doc__head">
                <div className="element-doc__title">{selSub.name}</div>
                <div className="element-doc__sub">{selSub.stations.length} steps · {selSub.flows.length} internal flow(s) · {selSub.w}×{selSub.h} cells</div>
              </div>
              <div className="lab" style={{ margin: "12px 0 4px" }}>Members</div>
              {selSub.stations.map((s) => (
                <details key={s.id} className="lib-member">
                  <summary>{s.name} <span style={{ color: TEXTD }}>· {s.type}</span></summary>
                  <StationDoc station={s} />
                </details>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <Button size="sm" kind="primary" style={{ flex: 1 }} onClick={() => insertSubflow(selSub.id)}>Add to layout</Button>
                <Button size="sm" kind="danger--tertiary" renderIcon={TrashCan} hasIconOnly={false} onClick={() => { subflows.remove(selSub.id); setSel(null); }}>Delete</Button>
              </div>
            </>
          ) : (
            <div style={{ color: TEXTD, fontSize: 12, padding: "24px 0" }}>Select an element to read its data sheet, edit it, or add it to the layout.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntryEditor({ entry: e, update }: { entry: ProcessCatalogEntry; update: (id: string, patch: Partial<ProcessCatalogEntry>) => void }) {
  return (
    <div>
      <Field label="Name">
        <input value={e.name} onChange={(ev) => update(e.id, { name: ev.target.value })} aria-label="Process name" />
      </Field>
      <div className="row2">
        <Field label="Category">
          <select value={e.category} onChange={(ev) => update(e.id, { category: ev.target.value as ProcessCategory })}>
            {PROCESS_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={e.stationType} onChange={(ev) => update(e.id, { stationType: ev.target.value as ProcessCatalogEntry["stationType"] })}>
            {STATION_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div className="row2">
        <Field label="Cycle time (s)" aside={e.dataQuality ? <QualityMark quality={e.dataQuality} /> : undefined}>
          <input type="number" value={e.cycleTimeSec} onChange={(ev) => update(e.id, { cycleTimeSec: +ev.target.value })} />
        </Field>
        <Field label="Data quality">
          <select value={e.dataQuality ?? "estimated"} onChange={(ev) => update(e.id, { dataQuality: ev.target.value as ProcessCatalogEntry["dataQuality"] })}>
            {DATA_QUALITIES.map((q) => <option key={q}>{q}</option>)}
          </select>
        </Field>
      </div>
      <div className="row2">
        <Field label="Capability (N:M)">
          <input value={e.capability ?? ""} onChange={(ev) => update(e.id, { capability: ev.target.value || undefined })} placeholder="e.g. screwdriving" />
        </Field>
        <Field label="Attended fraction">
          <input type="number" min={0} max={1} step={0.05} value={e.attendedFraction ?? 1} onChange={(ev) => update(e.id, { attendedFraction: Math.max(0, Math.min(1, +ev.target.value)) })} />
        </Field>
      </div>
      <div className="row2">
        <Field label="Changeover (min)">
          <input type="number" value={e.setupMin ?? 0} onChange={(ev) => update(e.id, { setupMin: +ev.target.value })} />
        </Field>
        <Field label="Machine invest">
          <input type="number" value={e.machineInvest ?? 0} onChange={(ev) => update(e.id, { machineInvest: +ev.target.value })} />
        </Field>
      </div>
      <div className="row2">
        <Field label="Width (cells)">
          <input type="number" min={1} value={e.w ?? 3} onChange={(ev) => update(e.id, { w: Math.max(1, +ev.target.value) })} />
        </Field>
        <Field label="Height (cells)">
          <input type="number" min={1} value={e.h ?? 2} onChange={(ev) => update(e.id, { h: Math.max(1, +ev.target.value) })} />
        </Field>
      </div>
      <Field label="Process id">
        <input value={e.processId ?? ""} onChange={(ev) => update(e.id, { processId: ev.target.value || undefined })} placeholder="PE number, if governed" />
      </Field>
      <Field label="Notes">
        <input value={e.notes ?? ""} onChange={(ev) => update(e.id, { notes: ev.target.value || undefined })} />
      </Field>
    </div>
  );
}
