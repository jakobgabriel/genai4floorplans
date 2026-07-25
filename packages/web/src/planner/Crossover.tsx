import { useMemo, useState } from "react";
import { InlineNotification, Tag } from "@carbon/react";
import { conceptCrossoverRanges, type CrossoverSegment, type GenerateBrief } from "@flowplan/core/engine/generate";
import { Btn } from "../components/Btn";
import { Footnote, SectionLabel } from "../components/analysisKit";
import { money, num } from "../format";

/**
 * Where the answer changes.
 *
 * The Concepts table answers "what is cheapest at the volume you typed". That
 * is one point on a curve, and an RFQ decision is rarely made at one point:
 * the demand is a forecast, it will be renegotiated, and the question that
 * actually gets asked in the room is "at what volume does this flip?".
 *
 * `conceptCrossoverRanges` has been in the engine — exported, unit-tested —
 * with nothing rendering it. This is the missing half.
 *
 * Two things it shows that the table cannot:
 *
 *   - How close the call is. A stretch won by 0.8% is not a recommendation,
 *     it is a coin toss between two sets of planning assumptions, and the
 *     table's single ranked list hides that completely.
 *   - Where the catalog runs out. Above some volume nothing on one line makes
 *     the demand, and that is a finding, not an empty result.
 *
 * It is behind a button because each sample point runs the full concept sweep.
 * Roughly 180 ms for the default resolution — fine on demand, not fine on
 * every keystroke in the parts table.
 */

/** A margin under this is reported as too close to call. */
const COIN_TOSS_PCT = 3;

const COLOURS = [
  "var(--cds-charts-1, #6929c4)",
  "var(--cds-charts-2, #1192e8)",
  "var(--cds-charts-3, #005d5d)",
  "var(--cds-charts-4, #9f1853)",
  "var(--cds-charts-5, #fa4d56)",
  "var(--cds-charts-6, #570408)",
];

export function Crossover({ brief, atVolume, currency }: { brief: GenerateBrief; atVolume: number; currency: string }) {
  const [open, setOpen] = useState(false);

  // Only computed once the planner asks for it, and only again if the brief
  // changes — the sweep is a couple of hundred candidate builds.
  const segs = useMemo(
    () => (open ? conceptCrossoverRanges(brief, { from: 1000, to: 5000000, samples: 12, refine: 5 }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, JSON.stringify(brief)],
  );

  if (!open) {
    return (
      <div className="xover__ask">
        <Btn size="compact" onClick={() => setOpen(true)}>
          Where does this flip?
        </Btn>
        <Footnote>
          Sweeps the volume axis and shows which concept wins where, and how close the call is at each point. Takes a
          moment — it runs the whole comparison at every sample.
        </Footnote>
      </div>
    );
  }

  if (segs.length === 0) return <Footnote>Nothing to sweep — the parts carry no routing.</Footnote>;

  const lo = segs[0].from;
  const hi = Math.max(atVolume * 2, segs[segs.length - 1].to ?? segs[segs.length - 1].from * 4);
  const pos = (v: number) => ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * 100;
  const colourOf = new Map<string, string>();
  segs.forEach((s) => {
    if (s.winner && !colourOf.has(s.winner)) colourOf.set(s.winner, COLOURS[colourOf.size % COLOURS.length]);
  });

  const here = segs.find((s) => atVolume >= s.from && (s.to == null || atVolume < s.to));
  const tossy = segs.filter((s) => s.winner && s.minMarginPct < COIN_TOSS_PCT);

  return (
    <div className="xover">
      <SectionLabel>Where the answer changes</SectionLabel>

      <div className="xover__band" role="img" aria-label="Winning concept by annual volume">
        {segs.map((s) => {
          const left = pos(s.from);
          const right = s.to == null ? 100 : pos(s.to);
          const width = Math.max(0, Math.min(100, right) - Math.max(0, left));
          if (width <= 0) return null;
          return (
            <div
              key={s.from}
              className={"xover__seg" + (s.winner ? "" : " xover__seg--none")}
              style={{ left: `${Math.max(0, left)}%`, width: `${width}%`, background: s.winner ? colourOf.get(s.winner) : undefined }}
              title={`${s.winnerLabel}: ${num(s.from)}–${s.to ? num(s.to) : "∞"}/yr`}
            />
          );
        })}
        {/* Where the brief actually sits, so the chart answers "and me?" */}
        <div className="xover__you" style={{ left: `${Math.min(100, Math.max(0, pos(atVolume)))}%` }}>
          <span className="xover__youLab">you · {num(atVolume)}/yr</span>
        </div>
      </div>
      <div className="xover__axis">
        <span>{num(lo)}</span>
        <span>{num(hi)}/yr</span>
      </div>

      <table className="rep__table xover__table">
        <thead>
          <tr>
            <th>Annual volume</th>
            <th>Cheapest concept</th>
            <th className="rep__numCol">Best cost/part</th>
            <th className="rep__numCol">Margin over the next concept</th>
          </tr>
        </thead>
        <tbody>
          {segs.map((s) => (
            <tr key={s.from} className={s === here ? "rep__rowPick" : undefined}>
              <td>
                {num(s.from)} – {s.to == null ? "∞" : num(s.to)}
                {s === here ? <span className="xover__hereTag"> ← you</span> : null}
              </td>
              <td>
                {s.winner ? (
                  <>
                    <span className="xover__dot" style={{ background: colourOf.get(s.winner) }} />
                    {s.winnerLabel}
                  </>
                ) : (
                  <em>nothing meets demand</em>
                )}
              </td>
              <td className="rep__numCol">{s.winner ? money(currency, s.costPerPart) : "—"}</td>
              <td className="rep__numCol">
                {s.winner ? (
                  <Tag type={s.minMarginPct < COIN_TOSS_PCT ? "magenta" : s.minMarginPct < 10 ? "gray" : "green"} size="sm">
                    {s.minMarginPct >= 100 ? "only option" : `${s.minMarginPct.toFixed(1)}%`}
                  </Tag>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {tossy.length > 0 ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={`Too close to call ${tossy.length === 1 ? "in one band" : `in ${tossy.length} bands`}`}
          subtitle={`${tossy
            .map((s) => `${s.winnerLabel} leads by ${s.minMarginPct.toFixed(1)}% between ${num(s.from)} and ${s.to ? num(s.to) : "∞"}`)
            .join("; ")}. A gap that small is inside the error of the concept assumptions — treat those stretches as a tie and decide on something the tool does not model.`}
        />
      ) : null}

      {segs.some((s) => !s.winner) ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Your catalog runs out"
          subtitle={`Above ${num(segs.find((s) => !s.winner)!.from)}/yr no concept in the catalog makes the demand on a single line. That is a real answer: it needs a second line, a different concept, or a band on the Concepts page that is wrong.`}
        />
      ) : null}

      <Footnote>
        Swept at twelve log-spaced volumes with each boundary bisected five times, against the concept catalog as you
        have it. Deterministic — the same brief always gives the same chart.
      </Footnote>
      <Btn size="compact" variant="ghost" onClick={() => setOpen(false)}>
        Hide
      </Btn>
    </div>
  );
}

export type { CrossoverSegment };
