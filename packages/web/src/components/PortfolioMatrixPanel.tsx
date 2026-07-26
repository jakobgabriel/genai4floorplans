import { useMemo, useState } from "react";
import { Button, MultiSelect, NumberInput, Tag, TextInput } from "@carbon/react";
import { TrashCan } from "@carbon/icons-react";
import type { PanelProps } from "./panels";
import type { CellStatus } from "@flowplan/core/engine/portfolio";
import { portfolioMatrix, portfolioCapacity } from "@flowplan/core/engine/portfolio";
import { catalogFor } from "@flowplan/core/model/capabilities";
import { AMBER, LINE, RED, TEAL, TEXT, TEXTD } from "./colors";

// Product-process feasibility matrix (audit C-11) — the industrialization
// engineer's part-number × capability matrix. Rows are part numbers, columns are
// capabilities; a cell shows whether the line provides what the part needs
// (directly, via a substitute, or a blocking gap). Gate 1 per part.

const CELL_BG: Record<CellStatus, string> = {
  provided: "rgba(43,182,168,.22)",
  alternative: "rgba(224,164,88,.22)",
  missing: "rgba(217,107,91,.28)",
  "not-required": "transparent",
};
const CELL_MARK: Record<CellStatus, string> = { provided: "✓", alternative: "~", missing: "✗", "not-required": "" };
const CELL_COL: Record<CellStatus, string> = { provided: TEAL, alternative: AMBER, missing: RED, "not-required": TEXTD };

export function PortfolioMatrixPanel({ api }: PanelProps) {
  const model = api.model;
  const catalog = useMemo(() => catalogFor(model), [model]);
  const mx = useMemo(() => portfolioMatrix(model), [model]);
  const cap = useMemo(() => portfolioCapacity(model), [model]);
  const [newNumber, setNewNumber] = useState("");
  const hrs = (sec: number) => Math.round(sec / 3600).toLocaleString();

  const capItems = catalog.map((c) => ({ id: c.id, label: c.name }));

  function addPart() {
    const number = newNumber.trim();
    if (!number) return;
    const id = `part_${Math.random().toString(36).slice(2, 8)}`;
    api.commit({ type: "ADD_PART", part: { id, number, requiredCapabilityIds: [] } });
    setNewNumber("");
  }

  return (
    <div className="pad">
      <div className="lab" style={{ marginBottom: 8 }}>Part-number feasibility matrix (Gate 1)</div>
      <p style={{ fontSize: "0.75rem", color: TEXTD, lineHeight: 1.6, marginBottom: 12 }}>
        Each part is an abstract workload — the capabilities it requires. The matrix checks them against
        what this line provides (from each station's capabilities), directly or via a catalogued
        alternative. Set station capabilities in Configure ▸ Provides.
      </p>

      {mx.empty ? (
        <div style={{ fontSize: "0.8rem", color: TEXTD, marginBottom: 16 }}>
          No parts yet. Add a part number below to start the matrix.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginBottom: 12, fontSize: "0.8rem" }}>
            <span>
              <strong style={{ color: mx.runnable === mx.total ? TEAL : AMBER, fontSize: "1.1rem" }}>{mx.runnable}</strong>
              <span style={{ color: TEXTD }}> / {mx.total} parts runnable on this line</span>
            </span>
            {mx.providedIds.length === 0 ? (
              <span style={{ color: RED }}>The line declares no capabilities — tag station capabilities in Configure ▸ Provides.</span>
            ) : null}
            {mx.blocking.length > 0 ? (
              <span style={{ color: TEXTD }}>
                Biggest blocker:{" "}
                <Tag type="red" size="sm">{mx.blocking[0].name} — blocks {mx.blocking[0].blockedParts}</Tag>
              </span>
            ) : null}
          </div>

          {/* The matrix */}
          <div style={{ overflowX: "auto", border: `1px solid ${LINE}`, marginBottom: 20 }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.72rem", minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, background: "var(--cds-layer-01)", textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${LINE}`, minWidth: 120 }}>Part</th>
                  {mx.columns.map((c) => (
                    <th key={c.id} title={`${c.name} · ${c.category}${c.provided ? " · line provides" : " · not provided"} · required by ${c.requiredByCount}`} style={{ padding: "6px 4px", borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`, writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", height: 96, color: c.provided ? TEXT : TEXTD }}>
                      {c.name}{c.provided ? " •" : ""}
                    </th>
                  ))}
                  <th style={{ padding: "6px 8px", borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}` }}>Gate 1</th>
                </tr>
              </thead>
              <tbody>
                {mx.rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ position: "sticky", left: 0, background: "var(--cds-layer-01)", padding: "5px 8px", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" }}>
                      <strong style={{ color: TEXT }}>{r.number}</strong>
                      {r.name ? <span style={{ color: TEXTD }}> · {r.name}</span> : null}
                    </td>
                    {mx.columns.map((c) => {
                      const cell = r.cells[c.id];
                      return (
                        <td key={c.id} title={cell.status === "alternative" ? `via ${cell.viaName}` : cell.status} style={{ textAlign: "center", padding: "5px 4px", borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`, background: CELL_BG[cell.status], color: CELL_COL[cell.status], fontWeight: 600 }}>
                          {CELL_MARK[cell.status]}
                        </td>
                      );
                    })}
                    <td style={{ padding: "5px 8px", borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`, whiteSpace: "nowrap" }}>
                      {r.verdict === "runnable" ? <Tag type="teal" size="sm">runnable</Tag> : <Tag type="red" size="sm" title={r.missingNames.join(", ")}>blocked: {r.missingNames.join(", ")}</Tag>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "0.72rem", color: TEXTD, marginBottom: 20 }}>
            <span style={{ color: TEAL }}>✓ provided</span> · <span style={{ color: AMBER }}>~ via alternative</span> · <span style={{ color: RED }}>✗ missing</span> · a “•” marks a capability the line provides.
          </div>

          {/* Investment priority */}
          {mx.blocking.length > 0 ? (
            <div style={{ marginBottom: 20 }}>
              <div className="lab" style={{ marginBottom: 6 }}>Capabilities to add, by parts unlocked</div>
              {mx.blocking.map((b) => (
                <div key={b.id} style={{ fontSize: "0.75rem", color: TEXTD, padding: "2px 0" }}>
                  <strong style={{ color: RED }}>{b.name}</strong> — would unlock {b.blockedParts} blocked part{b.blockedParts === 1 ? "" : "s"}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      {/* Capacity gate (Gate 3) */}
      {cap.hasData ? (
        <div style={{ marginBottom: 20 }}>
          <div className="lab" style={{ marginBottom: 6 }}>Capacity gate (Gate 3 — processing + changeover)</div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", fontSize: "0.8rem", marginBottom: 8 }}>
            <span>
              <strong style={{ color: cap.overCapacity ? RED : cap.utilizationPct > 90 ? AMBER : TEAL, fontSize: "1.1rem" }}>{cap.utilizationPct.toFixed(0)}%</strong>
              <span style={{ color: TEXTD }}> line utilization{cap.overCapacity ? " — over capacity" : ""}</span>
            </span>
            <span style={{ color: TEXTD }}>load {hrs(cap.totalLoadSecPerYear)} h/yr vs {hrs(cap.availableSecPerYear)} h available</span>
            <span style={{ color: TEXTD }}>changeover {hrs(cap.changeoverSecPerYear)} h ({cap.switchesPerYear} setups × {cap.changeoverMinutesPerSwitch} min)</span>
          </div>
          <div style={{ height: 12, background: LINE, marginBottom: 8, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, cap.utilizationPct)}%`, height: "100%", background: cap.overCapacity ? RED : cap.utilizationPct > 90 ? AMBER : TEAL }} title={`processing ${hrs(cap.processingSecPerYear)} h + changeover ${hrs(cap.changeoverSecPerYear)} h`} />
          </div>
          {cap.overCapacity && cap.drop.length > 0 ? (
            <div style={{ fontSize: "0.75rem", color: TEXTD }}>
              <strong style={{ color: RED }}>Drop to fit:</strong>{" "}
              {cap.drop.map((d) => `${d.number} (frees ${hrs(d.freedSecPerYear)} h, −${d.demandPerYear.toLocaleString()}/yr)`).join(" · ")}
            </div>
          ) : null}
          {cap.parts.some((p) => p.offVolume) ? (
            <div style={{ fontSize: "0.75rem", color: AMBER, marginTop: 4 }}>
              Off volume band (Gate 2): {cap.parts.filter((p) => p.offVolume).map((p) => p.number).join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Parts editor */}
      <div className="lab" style={{ marginBottom: 8 }}>Parts</div>
      {(model.parts ?? []).map((p) => (
        <div key={p.id} style={{ border: `1px solid ${LINE}`, padding: 10, marginBottom: 8 }}>
          <div className="row2">
            <TextInput id={`pt-num-${p.id}`} size="sm" labelText="Part number" value={p.number} onChange={(e) => api.commit({ type: "UPDATE_PART", id: p.id, patch: { number: e.target.value } })} />
            <TextInput id={`pt-name-${p.id}`} size="sm" labelText="Name (optional)" value={p.name ?? ""} onChange={(e) => api.commit({ type: "UPDATE_PART", id: p.id, patch: { name: e.target.value || undefined } })} />
          </div>
          <div style={{ marginTop: 8 }}>
            <MultiSelect
              id={`pt-caps-${p.id}`}
              size="sm"
              titleText="Required capabilities"
              label={p.requiredCapabilityIds.length ? `${p.requiredCapabilityIds.length} selected` : "Select capabilities"}
              items={capItems}
              itemToString={(i: { id: string; label: string } | null) => (i ? i.label : "")}
              selectedItems={capItems.filter((i) => p.requiredCapabilityIds.includes(i.id))}
              onChange={({ selectedItems }: { selectedItems: { id: string; label: string }[] }) => api.commit({ type: "UPDATE_PART", id: p.id, patch: { requiredCapabilityIds: selectedItems.map((i) => i.id) } })}
            />
          </div>
          <div className="row2" style={{ marginTop: 8 }}>
            <NumberInput id={`pt-demand-${p.id}`} size="sm" label="Demand / year" min={0} allowEmpty value={p.demandPerYear ?? ""} onChange={(_e, { value }) => api.commit({ type: "UPDATE_PART", id: p.id, patch: { demandPerYear: value === "" ? undefined : Math.max(0, +value) } })} />
            <NumberInput id={`pt-campaigns-${p.id}`} size="sm" label="Campaigns / year" min={1} allowEmpty value={p.campaignsPerYear ?? ""} onChange={(_e, { value }) => api.commit({ type: "UPDATE_PART", id: p.id, patch: { campaignsPerYear: value === "" ? undefined : Math.max(1, Math.floor(+value)) } })} />
          </div>
          <div className="row2" style={{ marginTop: 8, alignItems: "end" }}>
            <TextInput id={`pt-family-${p.id}`} size="sm" labelText="Changeover family (optional)" value={p.changeoverFamily ?? ""} onChange={(e) => api.commit({ type: "UPDATE_PART", id: p.id, patch: { changeoverFamily: e.target.value || undefined } })} />
            <Button hasIconOnly kind="danger--tertiary" size="sm" renderIcon={TrashCan} iconDescription="Delete part" onClick={() => api.commit({ type: "DELETE_PART", id: p.id })} />
          </div>
        </div>
      ))}
      <div className="row2" style={{ marginTop: 8, alignItems: "end" }}>
        <TextInput id="pt-new" size="sm" labelText="Add part number" placeholder="e.g. 12345-A" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPart(); }} />
        <Button size="sm" kind="tertiary" onClick={addPart}>Add part</Button>
      </div>
    </div>
  );
}
