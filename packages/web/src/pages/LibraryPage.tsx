import { useState } from "react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { navigate } from "../store/useHashRoute";
import { useLibrary } from "../store/library";
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
import { TEXTD } from "../components/colors";

// The process library — a global catalog of standard building blocks. Absorbs
// the PAUL "Catalog" fields (std cycle time, robustness, tariffs surrogate,
// space, tooling, machine invest, process id) and the blueprint's building
// blocks. Placing an entry authors a station pre-filled with its standards.
export function LibraryPage({ api }: { api: FlowPlanApi }) {
  const { entries, add, update, remove, resetToSeed } = useLibrary();
  const { toast } = useToast();
  const [filter, setFilter] = useState<ProcessCategory | "all">("all");

  const shown = entries.filter((e) => filter === "all" || e.category === filter);

  function addToCell(e: ProcessCatalogEntry) {
    const base = makeStation(api.model);
    api.commit({ type: "ADD_STATION", station: { ...base, ...(catalogStationPatch(e) as object) } });
    toast(`Added ${e.name} to the cell`);
    navigate("/");
  }

  function newEntry() {
    const id = `cat-${Math.random().toString(36).slice(2, 8)}`;
    add({ id, name: "New process", category: filter === "all" ? "assembly" : filter, stationType: "machine", cycleTimeSec: 30, dataQuality: "estimated", attendedFraction: 1, w: 3, h: 2 });
  }

  return (
    <div className="page">
      <div className="page-head">
        <button className="btn sm" onClick={() => navigate("/")}>← Editor</button>
        <h1 className="page-title">Process library</h1>
        <div className="spacer" />
        <button className="btn sm" onClick={newEntry}>＋ New process</button>
        <button className="btn sm" onClick={() => { if (confirm("Reset the library to the seed catalog? Custom entries are lost.")) resetToSeed(); }}>Reset to seed</button>
      </div>

      <p style={{ fontSize: 12, color: TEXTD, maxWidth: 640, marginTop: 0 }}>
        Standard building blocks with known characteristics and defined interfaces.
        A process declares the <strong>capability</strong> it provides — matched N:M
        to resources, never a 1:1 workcenter. Drop one from the palette, or add it
        to the open cell here.
      </p>

      <div className="explorer-actions" style={{ marginBottom: 16 }}>
        {(["all", ...PROCESS_CATEGORIES] as const).map((c) => (
          <button key={c} className={"btn sm" + (filter === c ? " on" : "")} onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="admin-grid">
        {shown.map((e) => (
          <div key={e.id} className="chart-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <input
                value={e.name}
                onChange={(ev) => update(e.id, { name: ev.target.value })}
                style={{ fontWeight: 600, minHeight: "2rem" }}
                aria-label="Process name"
              />
            </div>
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
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button className="btn sm on" style={{ flex: 1 }} onClick={() => addToCell(e)}>Add to cell</button>
              <button className="btn sm danger" onClick={() => remove(e.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
