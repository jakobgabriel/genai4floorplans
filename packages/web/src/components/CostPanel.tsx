import { ClickableTile, NumberInput, Stack, Tag } from "@carbon/react";
import { costAnalysis } from "@flowplan/core/engine/cost";
import { DEFAULT_COST_CONFIG } from "@flowplan/core/model/types";
import type { PanelProps } from "./panels";
import { Footnote, MetricTile, SectionLabel } from "./analysisKit";

// Cost & ROI panel. Informational — reuses costAnalysis (which reuses the flow
// and balance engines). Not part of the composite grade.
//
// Standardized on Carbon components (Tile / Tag / NumberInput); status rides on
// Carbon's Tag palette only, no bespoke cost-colour thresholds.
const verdictTag = (v: string): "green" | "blue" | "red" => (v === "Automate" ? "green" : v === "Consider" ? "blue" : "red");

export function CostPanel({ api, setSel, setTab }: PanelProps) {
  const c = costAnalysis(api.model);
  const cc = api.model.costConfig ?? {};
  const cfg = {
    laborCostPerHour: cc.laborCostPerHour ?? DEFAULT_COST_CONFIG.laborCostPerHour,
    annualShifts: cc.annualShifts ?? DEFAULT_COST_CONFIG.annualShifts,
  };
  const cur = c.currency;
  const money = (n: number) => cur + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const kv = (k: string, v: string) => (
    <div className="ak-kv" key={k}>
      <span className="ak-kv__k">{k}</span>
      <span className="ak-kv__v">{v}</span>
    </div>
  );
  return (
    <div className="pad ak-panel">
      <Stack gap={6}>
        <Stack gap={4}>
          <SectionLabel>Cost &amp; ROI</SectionLabel>
          <MetricTile
            label="Operating cost per part"
            value={money(c.costPerPart)}
            sub={`at ${c.lineOut.toLocaleString()} parts/shift`}
          />
          <Stack gap={2}>
            {kv("Labor / shift", money(c.laborPerShift))}
            {kv("Transport / shift", money(c.transportPerShift))}
            {kv("Energy / shift", money(c.energyPerShift))}
            {kv("Opex / shift", money(c.opexPerShift))}
            {kv("Equipment capex", money(c.capexTotal))}
          </Stack>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Assumptions</SectionLabel>
          <div className="row2">
            <NumberInput
              id="cost-labor-hour"
              label="Labor / hour"
              hideSteppers
              value={cfg.laborCostPerHour}
              onFocus={api.checkpoint}
              onChange={(_: unknown, s: { value: number | string }) =>
                api.live({ type: "SET_COST_CONFIG", patch: { laborCostPerHour: Number(s.value) || 0 } })
              }
            />
            <NumberInput
              id="cost-annual-shifts"
              label="Shifts / year"
              hideSteppers
              value={cfg.annualShifts}
              onFocus={api.checkpoint}
              onChange={(_: unknown, s: { value: number | string }) =>
                api.live({ type: "SET_COST_CONFIG", patch: { annualShifts: Number(s.value) || 0 } })
              }
            />
          </div>
          <Footnote>Set per-step equipment capex and automation capex in Configure.</Footnote>
        </Stack>

        <Stack gap={4}>
          <SectionLabel>Automation ROI</SectionLabel>
          <Stack gap={3}>
            {c.automation.map((a) => (
              <ClickableTile key={a.id} className="ak-row" onClick={() => { setSel(a.id); setTab("inspect"); }}>
                <div className="ak-row__head">
                  <span>{a.name}</span>
                  <Tag type={verdictTag(a.verdict)} size="sm">
                    {a.verdict}
                  </Tag>
                </div>
                <div className="ak-row__sub">
                  {a.automationCapex > 0 ? (
                    <>
                      capex {cur}
                      {a.automationCapex.toLocaleString()} · saves {cur}
                      {a.laborSavedPerYear.toLocaleString()}/yr ·{" "}
                      {a.paybackMonths == null ? "payback —" : "payback " + a.paybackMonths + " mo"}
                    </>
                  ) : (
                    "set automation capex in Configure to see payback"
                  )}
                </div>
              </ClickableTile>
            ))}
          </Stack>
          <Footnote>
            Payback = automation capex ÷ annual labor saved. Informational — cost isn't part of the composite grade.
          </Footnote>
        </Stack>
      </Stack>
    </div>
  );
}
