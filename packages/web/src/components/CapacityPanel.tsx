import { useMemo } from "react";
import type { PanelProps } from "./panels";
import { capacityAnalysis } from "@flowplan/core/engine/capacity";
import { DEFAULT_SHIFT_MODEL, type Demand } from "@flowplan/core/model/types";
import { Field, HelpPopover } from "./ui";
import { TEAL, AMBER, RED, TEXT, TEXTD } from "./colors";

// Capacity analysis (PAUL Capa MA/HC). Machines needed per year and head count,
// from multi-year demand and the shift model. Lives in the Analysis view.
export function CapacityPanel({ api }: PanelProps) {
  const model = api.model;
  const cap = useMemo(() => capacityAnalysis(model), [model]);
  const sm = { ...DEFAULT_SHIFT_MODEL, ...(model.demand ?? {}) };
  const years = model.demand?.years ?? [];

  const setDemand = (patch: Partial<Demand>) =>
    api.commit({ type: "SET_DEMAND", demand: { years, ...model.demand, ...patch } as Demand });

  function seedYears() {
    const base = new Date(2026, 0, 1).getFullYear(); // fixed base — Date.now unavailable in some envs
    const seeded = Array.from({ length: 5 }, (_, i) => ({ year: base + i, units: 100000 }));
    api.commit({ type: "SET_DEMAND", demand: { ...(model.demand ?? {}), years: seeded } });
  }
  function setYearUnits(year: number, units: number) {
    setDemand({ years: years.map((y) => (y.year === year ? { ...y, units } : y)) });
  }

  const numField = (label: string, value: number, on: (n: number) => void, step = 1) => (
    <Field label={label}>
      <input type="number" min={0} step={step} value={value} onChange={(e) => on(+e.target.value)} />
    </Field>
  );

  return (
    <div className="pad">
      <div className="lab" style={{ marginBottom: 8, display: "flex", alignItems: "center" }}>
        Capacity — machines &amp; head count
        <HelpPopover text="PAUL Capa MA/HC. Machines needed per year = units × cycle ÷ available time; available time = working days × shifts × hours × 3600 × OEE. Manual steps drive head count, machine/test steps drive machine capacity." />
      </div>

      {/* Shift model — the available-time inputs. */}
      <div className="row2">
        {numField("Shifts / day", sm.shiftsPerDay, (n) => setDemand({ shiftsPerDay: Math.max(1, n) }))}
        {numField("Hours / shift", sm.hoursPerShift, (n) => setDemand({ hoursPerShift: Math.max(0.5, n) }))}
      </div>
      <div className="row2">
        {numField("Working days / yr", sm.workingDaysPerYear, (n) => setDemand({ workingDaysPerYear: Math.max(1, n) }))}
        <Field label="OEE (%)">
          <input type="number" min={1} max={100} value={Math.round(sm.oee * 100)} onChange={(e) => setDemand({ oee: Math.max(0.01, Math.min(1, +e.target.value / 100)) })} />
        </Field>
      </div>

      {years.length === 0 ? (
        <button className="btn" style={{ width: "100%", color: TEAL, marginTop: 6 }} onClick={seedYears}>
          Add a 5-year demand horizon
        </button>
      ) : (
        <>
          <div className="lab" style={{ margin: "12px 0 6px" }}>Demand per year (units)</div>
          {years.map((y) => (
            <div key={y.year} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 44, color: TEXTD, fontSize: 12 }}>{y.year}</span>
              <input type="number" min={0} value={y.units} onChange={(e) => setYearUnits(y.year, +e.target.value)} />
            </div>
          ))}

          <div className="lab" style={{ margin: "14px 0 6px" }}>
            Machines needed{cap.peakYear != null ? ` · peak ${cap.peakYear}` : ""}
          </div>
          <table className="schemaTbl">
            <thead>
              <tr>
                <th>Step</th>
                {cap.years.map((yr) => <th key={yr} style={{ textAlign: "right" }}>{yr}</th>)}
              </tr>
            </thead>
            <tbody>
              {cap.machines.map((m) => (
                <tr key={m.stationId}>
                  <td>{m.name}<div style={{ fontSize: 10, color: TEXTD }}>{m.cycleSec}s</div></td>
                  {m.perYear.map((p) => {
                    const col = p.utilizationPct >= 95 ? RED : p.utilizationPct >= 80 ? AMBER : TEAL;
                    return (
                      <td key={p.year} style={{ textAlign: "right" }}>
                        <span style={{ color: TEXT }}>{p.machinesNeeded}</span>
                        <div style={{ fontSize: 10, color: col }}>{p.utilizationPct}%</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {cap.machines.length === 0 ? <div style={{ fontSize: 11, color: TEXTD }}>No machine/test steps — this cell is head-count driven.</div> : null}
        </>
      )}

      <div className="lab" style={{ margin: "14px 0 6px" }}>Head count</div>
      <div style={{ display: "flex", gap: 18, fontSize: 12 }}>
        <span><span style={{ color: TEXTD }}>per shift </span><strong style={{ color: TEXT }}>{cap.operatorsPerShift}</strong></span>
        <span><span style={{ color: TEXTD }}>all shifts </span><strong style={{ color: TEXT }}>{cap.operatorsAllShifts}</strong></span>
      </div>
      <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 6, lineHeight: 1.5 }}>
        Operators at full manning across the process steps. Investment (machine price, transport,
        equipment, building space) follows the concept decision — not modelled here.
      </div>
    </div>
  );
}
