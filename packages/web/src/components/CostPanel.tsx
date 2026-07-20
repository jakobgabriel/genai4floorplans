import { costAnalysis } from "@flowplan/core/engine/cost";
import { DEFAULT_COST_CONFIG } from "@flowplan/core/model/types";
import { Field, HelpPopover } from "./ui";
import type { PanelProps } from "./panels";
import { AMBER, TEAL, TEXTD, scoreColor } from "./colors";

// Cost & ROI panel. Informational — reuses costAnalysis (which reuses the flow
// and balance engines). Not part of the composite grade.
export function CostPanel({ api, setSel, setTab }: PanelProps) {
  const c = costAnalysis(api.model);
  const cc = api.model.costConfig ?? {};
  const cfg = {
    laborCostPerHour: cc.laborCostPerHour ?? DEFAULT_COST_CONFIG.laborCostPerHour,
    annualShifts: cc.annualShifts ?? DEFAULT_COST_CONFIG.annualShifts,
  };
  const cur = c.currency;
  const money = (n: number) => cur + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const row = (k: string, v: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
      <span style={{ color: TEXTD }}>{k}</span>
      <span>{v}</span>
    </div>
  );
  return (
    <div className="pad">
      <div className="lab" style={{ marginBottom: 8 }}>
        Cost &amp; ROI
      </div>
      <div className="imp" style={{ marginTop: 0 }}>
        <div className="lab">Operating cost per part</div>
        <div className="impVal">{money(c.costPerPart)}</div>
        <div style={{ fontSize: 11, color: TEXTD, marginTop: 4 }}>at {c.lineOut.toLocaleString()} parts/shift</div>
      </div>
      {row("Labor / shift", money(c.laborPerShift))}
      {row("Transport / shift", money(c.transportPerShift))}
      {row("Energy / shift", money(c.energyPerShift))}
      {row("Opex / shift", money(c.opexPerShift))}
      {row("Equipment capex", money(c.capexTotal))}

      {/* LDC/MDC split (PAUL): labour-dependent vs machine-dependent cost/part. */}
      <div className="lab" style={{ margin: "16px 0 6px", display: "flex", alignItems: "center" }}>
        Cost per part — LDC / MDC
        <HelpPopover text="PAUL split: LDC = labour-dependent cost (operator time), MDC = machine-dependent cost (energy + transport). Together they make the operating cost per part." />
      </div>
      {row("LDC — labour", money(c.ldcPerPart))}
      {row("MDC — machine", money(c.mdcPerPart))}

      {/* Floor space, split cell vs material supply (blueprint §4.9): the bin and
          replenishment area is routinely forgotten and understates by a third. */}
      <div className="lab" style={{ margin: "16px 0 6px", display: "flex", alignItems: "center" }}>
        Floor space
        <HelpPopover text={`Reported as two figures on purpose. Cell = the area the stations occupy. Material supply = bins and replenishment, a further ${Math.round(c.floorSpace.factor * 100)}% that is routinely forgotten. One combined number understates the footprint by about a third. Units: ${c.floorSpace.unit}.`} />
      </div>
      {row("Cell", `${c.floorSpace.cell.toLocaleString()} ${c.floorSpace.unit}`)}
      {row("Material supply", `+${c.floorSpace.materialSupply.toLocaleString()} ${c.floorSpace.unit}`)}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 3, borderTop: `1px solid ${TEXTD}33`, paddingTop: 3 }}>
        <span style={{ color: TEXTD }}>Total footprint</span>
        <strong>{c.floorSpace.total.toLocaleString()} {c.floorSpace.unit}</strong>
      </div>

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Assumptions
      </div>
      <div className="row2">
        <Field label="Labor / hour">
          <input
            type="number"
            value={cfg.laborCostPerHour}
            onFocus={api.checkpoint}
            onChange={(e) => api.live({ type: "SET_COST_CONFIG", patch: { laborCostPerHour: +e.target.value } })}
          />
        </Field>
        <Field label="Shifts / year">
          <input
            type="number"
            value={cfg.annualShifts}
            onFocus={api.checkpoint}
            onChange={(e) => api.live({ type: "SET_COST_CONFIG", patch: { annualShifts: +e.target.value } })}
          />
        </Field>
      </div>
      <div style={{ fontSize: 10.5, color: TEXTD, marginBottom: 6 }}>Set per-step equipment capex and automation capex in Configure.</div>

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Automation ROI
      </div>
      {c.automation.map((a) => {
        const col = a.paybackMonths == null ? TEXTD : a.paybackMonths <= 18 ? TEAL : a.paybackMonths <= 36 ? AMBER : "#d96b5b";
        return (
          <div key={a.id} className="card" style={{ cursor: "pointer" }} onClick={() => { setSel(a.id); setTab("inspect"); }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: 12 }}>{a.name}</span>
              <span style={{ fontSize: 11, color: scoreColor(a.verdict === "Automate" ? 80 : a.verdict === "Consider" ? 60 : 40) }}>{a.verdict}</span>
            </div>
            <div style={{ fontSize: 10.5, color: TEXTD }}>
              {a.automationCapex > 0 ? (
                <>
                  capex {cur}
                  {a.automationCapex.toLocaleString()} · saves {cur}
                  {a.laborSavedPerYear.toLocaleString()}/yr ·{" "}
                  <span style={{ color: col }}>{a.paybackMonths == null ? "—" : "payback " + a.paybackMonths + " mo"}</span>
                </>
              ) : (
                <span>set automation capex in Configure to see payback</span>
              )}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 6, lineHeight: 1.5 }}>
        Payback = automation capex ÷ annual labor saved. Informational — cost isn't part of the composite grade.
      </div>
    </div>
  );
}
