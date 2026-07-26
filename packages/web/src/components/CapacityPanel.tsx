import { useMemo } from "react";
import type { PanelProps } from "./panels";
import { capacityAnalysis } from "@flowplan/core/engine/capacity";
import { DEFAULT_SHIFT_MODEL, type Demand } from "@flowplan/core/model/types";
import {
  Button,
  NumberInput,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
} from "@carbon/react";
import { HelpPopover } from "./ui";
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

  const numField = (id: string, label: string, value: number, on: (n: number) => void, step = 1) => (
    <NumberInput id={id} label={label} min={0} step={step} value={value} onChange={(_: unknown, s: { value: number | string }) => on(+s.value)} />
  );

  return (
    <div className="pad">
      <div className="lab" style={{ marginBottom: 8, display: "flex", alignItems: "center" }}>
        Capacity — machines &amp; head count
        <HelpPopover text="PAUL Capa MA/HC. Machines needed per year = units × cycle ÷ available time; available time = working days × shifts × hours × 3600 × OEE. Manual steps drive head count, machine/test steps drive machine capacity." />
      </div>

      {/* Shift model — the available-time inputs. */}
      <div className="row2">
        {numField("cap-shifts-day", "Shifts / day", sm.shiftsPerDay, (n) => setDemand({ shiftsPerDay: Math.max(1, n) }))}
        {numField("cap-hours-shift", "Hours / shift", sm.hoursPerShift, (n) => setDemand({ hoursPerShift: Math.max(0.5, n) }))}
      </div>
      <div className="row2">
        {numField("cap-working-days", "Working days / yr", sm.workingDaysPerYear, (n) => setDemand({ workingDaysPerYear: Math.max(1, n) }))}
        <NumberInput
          id="cap-oee"
          label="OEE (%)"
          min={1}
          max={100}
          value={Math.round(sm.oee * 100)}
          onChange={(_: unknown, s: { value: number | string }) => setDemand({ oee: Math.max(0.01, Math.min(1, +s.value / 100)) })}
        />
      </div>

      {years.length === 0 ? (
        <Button kind="tertiary" size="sm" style={{ width: "100%", marginTop: 6 }} onClick={seedYears}>
          Add a 5-year demand horizon
        </Button>
      ) : (
        <>
          <div className="lab" style={{ margin: "12px 0 6px" }}>Demand per year (units)</div>
          {years.map((y) => (
            <div key={y.year} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 44, color: TEXTD, fontSize: "0.75rem" }}>{y.year}</span>
              <NumberInput id={`cap-year-${y.year}`} label={`${y.year} units`} hideLabel min={0} value={y.units} onChange={(_: unknown, s: { value: number | string }) => setYearUnits(y.year, +s.value)} />
            </div>
          ))}

          <div className="lab" style={{ margin: "14px 0 6px" }}>
            Machines needed{cap.peakYear != null ? ` · peak ${cap.peakYear}` : ""}
          </div>
          <StructuredListWrapper isCondensed>
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>Step</StructuredListCell>
                {cap.years.map((yr) => <StructuredListCell head key={yr} style={{ textAlign: "right" }}>{yr}</StructuredListCell>)}
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {cap.machines.map((m) => (
                <StructuredListRow key={m.stationId}>
                  <StructuredListCell>{m.name}<div style={{ fontSize: "0.75rem", color: TEXTD }}>{m.cycleSec}s</div></StructuredListCell>
                  {m.perYear.map((p) => {
                    const col = p.utilizationPct >= 95 ? RED : p.utilizationPct >= 80 ? AMBER : TEAL;
                    return (
                      <StructuredListCell key={p.year} style={{ textAlign: "right" }}>
                        <span style={{ color: TEXT }}>{p.machinesNeeded}</span>
                        <div style={{ fontSize: "0.75rem", color: col }}>{p.utilizationPct}%</div>
                      </StructuredListCell>
                    );
                  })}
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
          {cap.machines.length === 0 ? <div style={{ fontSize: "0.75rem", color: TEXTD }}>No machine/test steps — this cell is head-count driven.</div> : null}
        </>
      )}

      <div className="lab" style={{ margin: "14px 0 6px" }}>Head count</div>
      <div style={{ display: "flex", gap: 18, fontSize: "0.75rem" }}>
        <span><span style={{ color: TEXTD }}>per shift </span><strong style={{ color: TEXT }}>{cap.operatorsPerShift}</strong></span>
        <span><span style={{ color: TEXTD }}>all shifts </span><strong style={{ color: TEXT }}>{cap.operatorsAllShifts}</strong></span>
      </div>
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 6, lineHeight: 1.5 }}>
        Operators at full manning across the process steps. Investment (machine price, transport,
        equipment, building space) follows the concept decision — not modelled here.
      </div>
    </div>
  );
}
