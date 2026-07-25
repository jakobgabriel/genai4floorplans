import { useMemo, useState } from "react";
import { InlineNotification, Tag } from "@carbon/react";
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
          How fragile is this?
        </Btn>
        <Footnote>
          Varies demand, labour rate, program length and shift pattern by ±{spreadPct}% one at a time, and reports
          whether the winning concept changes.
        </Footnote>
      </div>
    );
  }

  if (!result || result.rows.length === 0) return <Footnote>Nothing to vary — the parts carry no routing.</Footnote>;

  const all = result.flipCount === result.rows.length;

  return (
    <div className="xover">
      <SectionLabel>How fragile is this?</SectionLabel>

      <InlineNotification
        kind={result.flipCount === 0 ? "success" : all ? "warning" : "info"}
        lowContrast
        hideCloseButton
        title={
          result.flipCount === 0
            ? `${result.baseWinner} holds against every factor`
            : all
              ? `Every factor changes the answer`
              : `${result.flipCount} of ${result.rows.length} factors change the answer`
        }
        subtitle={
          result.flipCount === 0
            ? `A ±${spreadPct}% error in any one of demand, labour rate, program length or shift pattern still leaves ${result.baseWinner} in front.`
            : all
              ? `At this brief the ranking is not a recommendation. A ±${spreadPct}% error in any single input puts a different concept in front, so the choice has to be made on something this tool does not model — or on a number you can pin down better first.`
              : `The named factors below move the winner on their own. Pin those down before treating the ranking as a decision.`
        }
      />

      <table className="rep__table xover__table">
        <thead>
          <tr>
            <th>If this is wrong</th>
            <th>−{spreadPct}%</th>
            <th>+{spreadPct}%</th>
            <th className="rep__numCol">Holds?</th>
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
        Base case: <b>{result.baseWinner}</b>. A factor counts as changing the answer when either end differs from the
        base, not only when the two ends differ from each other — lane rounding makes the cost curve step rather than
        slope, so both ends can land on the same concept while the middle sits on another.
      </Footnote>
      <Btn size="compact" variant="ghost" onClick={() => setOpen(false)}>
        Hide
      </Btn>
    </div>
  );
}
