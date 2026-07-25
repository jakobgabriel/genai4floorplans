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

const CRITERIA: Array<{ key: keyof DecisionWeights; label: string; help: string }> = [
  { key: "cost", label: "Cost per part", help: "Fully loaded — operating plus amortised capex. Lower wins." },
  { key: "capex", label: "Capital exposure", help: "What you have to spend before the first part. Lower wins." },
  { key: "fit", label: "Suits the volume", help: "How far inside its viable band the concept sits — the band you set on the Concepts page." },
  { key: "operators", label: "Manning", help: "Operators the concept needs. Lower wins." },
  { key: "flexibility", label: "Flexibility", help: "Total changeover minutes across the line — a proxy for coping with a mix it was not planned for. Lower wins." },
];

export function DecisionWeightsEditor({ api }: { api: DecisionWeightsApi }) {
  const pct = (k: keyof DecisionWeights) => Math.round(api.normalized[k] * 100);
  return (
    <div className="dw">
      <div className="dw__head">
        <SectionLabel>What counts as best</SectionLabel>
        {api.isDefault ? null : (
          <Btn size="compact" variant="ghost" onClick={api.reset}>
            Reset the weighting
          </Btn>
        )}
      </div>
      <div className="dw__grid">
        {CRITERIA.map((c) => (
          <div className="dw__row" key={c.key}>
            <Slider
              id={"dw-" + c.key}
              labelText={`${c.label} — ${pct(c.key)}%`}
              min={0}
              max={100}
              step={5}
              value={Math.round(api.weights[c.key] * 100)}
              onChange={({ value }: { value: number }) => api.set(c.key, value / 100)}
              hideTextInput
            />
            <Footnote>{c.help}</Footnote>
          </div>
        ))}
      </div>
      <Footnote>
        Shown as shares of the total, so what you see is what the ranking uses. Put everything on cost per part and the
        order is the one this tool gave before these existed.
      </Footnote>
    </div>
  );
}
