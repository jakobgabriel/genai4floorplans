import { useMemo, useState } from "react";
import { Tag } from "@carbon/react";
import { sensitivity, type DecisionWeights, type GenerateBrief } from "@flowplan/core/engine/generate";
import { Btn } from "../components/Btn";
import { Footnote, SectionLabel } from "../components/analysisKit";

/**
 * Does the answer survive being wrong about one thing?
 *
 * A brief is a set of estimates. The demand is a forecast, the labour rate is a
 * planning figure, the program length is a negotiation, the shift pattern is a
 * assumption about a plant that may not run that way in two years. Ranking them
 * once and reporting a winner says nothing about whether that winner holds if
 * any single one of them is off — which is the first question asked in the room
 * the recommendation is taken into.
 *
 * One factor at a time, low and high. An interaction study needs a design of
 * experiments; this answers "how fragile is this" in one glance, and when
 * everything flips it says so plainly rather than letting a ranked list imply
 * a confidence it does not have.
 */
export function Sensitivity({
  brief,
  weights,
  spreadPct = 30,
}: {
  brief: GenerateBrief;
  weights: DecisionWeights;
  spreadPct?: number;
}) {
  const [open, setOpen] = useState(false);
  const result = useMemo(
    () => (open ? sensitivity(brief, weights, spreadPct) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, JSON.stringify(brief), JSON.stringify(weights), spreadPct],
  );

  if (!open) {
    return (
      <div className="xover__ask">
        <Btn size="compact" onClick={() => setOpen(true)}>
          Sensitivity
        </Btn>
      </div>
    );
  }

  if (!result || result.rows.length === 0) return <Footnote>No routing.</Footnote>;

  return (
    <div className="xover">
      <div className="sens__head">
        <SectionLabel>Sensitivity ±{spreadPct}%</SectionLabel>
        <Tag type={result.flipCount === 0 ? "green" : result.flipCount === result.rows.length ? "red" : "magenta"} size="sm">
          {result.flipCount} of {result.rows.length} change the winner
        </Tag>
      </div>

      <table className="rep__table xover__table">
        <thead>
          <tr>
            <th>Factor</th>
            <th>−{spreadPct}%</th>
            <th>+{spreadPct}%</th>
            <th className="rep__numCol">Winner</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.factor}>
              <td>{r.factor}</td>
              <td>
                <span className="sens__at">{r.lowLabel}</span> {r.lowWinner}
              </td>
              <td>
                <span className="sens__at">{r.highLabel}</span> {r.highWinner}
              </td>
              <td className="rep__numCol">
                <Tag type={r.flips ? "magenta" : "green"} size="sm">
                  {r.flips ? "changes" : "holds"}
                </Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Footnote>
        Base case: {result.baseWinner}. One factor varied at a time; a factor counts as changing the winner when either
        end differs from the base.
      </Footnote>
      <Btn size="compact" variant="ghost" onClick={() => setOpen(false)}>
        Hide
      </Btn>
    </div>
  );
}
