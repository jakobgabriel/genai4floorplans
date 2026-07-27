import { Slider } from "@carbon/react";
import type { DecisionWeights } from "@flowplan/core/engine/generate";
import type { DecisionWeightsApi } from "../store/decisionWeights";
import { Btn } from "../components/Btn";
import { Footnote, SectionLabel } from "../components/analysisKit";

/**
 * What "best" means, as five numbers you can move.
 *
 * The concept ranking was `loadedCostPerPart` and nothing else — a defensible
 * objective, but only one of several, and stated nowhere. Capex exposure, how
 * well the concept suits the volume, manning and changeover burden were all
 * computed, all shown in the table, and none of them touched the order.
 *
 * The fix is not a different hardcoded objective. It is naming the criteria and
 * handing over the weighting: drag `cost` to the top and everything else to
 * zero and you get exactly the old ranking back.
 */

/** Each weight's label and the metric it reads, shown as a tooltip. */
const CRITERIA: Array<{ key: keyof DecisionWeights; label: string; metric: string }> = [
  { key: "cost", label: "Cost / part", metric: "Loaded cost per part — operating plus amortised capex. Minimised." },
  { key: "capex", label: "Capex", metric: "Total capital cost. Minimised." },
  { key: "fit", label: "Volume fit", metric: "Concept fit against its viable band. Maximised." },
  { key: "operators", label: "Operators", metric: "Operators required. Minimised." },
  { key: "flexibility", label: "Flexibility", metric: "Total changeover minutes. Minimised." },
];

export function DecisionWeightsEditor({ api }: { api: DecisionWeightsApi }) {
  const pct = (k: keyof DecisionWeights) => Math.round(api.normalized[k] * 100);
  return (
    <div className="dw">
      <div className="dw__head">
        <SectionLabel>Ranking weights</SectionLabel>
        {api.isDefault ? null : (
          <Btn size="compact" variant="ghost" onClick={api.reset}>
            Reset
          </Btn>
        )}
      </div>
      <div className="dw__grid">
        {CRITERIA.map((c) => (
          <div className="dw__row" key={c.key} title={c.metric}>
            <Slider
              id={"dw-" + c.key}
              labelText={`${c.label} · ${pct(c.key)}%`}
              min={0}
              max={100}
              step={5}
              value={Math.round(api.weights[c.key] * 100)}
              onChange={({ value }: { value: number }) => api.set(c.key, value / 100)}
              formatLabel={(value: number) => `${value}%`}
              hideTextInput
            />
          </div>
        ))}
      </div>
      <Footnote>Normalised to 100%. Criteria are min-max scaled across the candidate set.</Footnote>
    </div>
  );
}
