import { Tag, Tile } from "@carbon/react";
import { Printer } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { navigate } from "../store/useHashRoute";
import { PageHead } from "../components/PageHead";
import { Btn } from "../components/Btn";
import { LayoutCanvas } from "../components/LayoutCanvas";
import { Footnote, KpiMeter, SectionLabel, ShareBar, scoreTag } from "../components/analysisKit";
import { analysisPath } from "../components/analysisPath";
import { useAccents } from "../components/colors";
import { costAnalysis } from "@flowplan/core/engine/cost";
import { yieldAnalysis } from "@flowplan/core/engine/yield";
import { autoPotential } from "@flowplan/core/engine/automation";
import { findImprovements } from "@flowplan/core/engine/improve";
import type { Candidate } from "@flowplan/core/engine/generate";
import { FORM_LABELS } from "@flowplan/core/engine/templates";
import type { PortfolioDerivation } from "@flowplan/core/engine/portfolio";
import type { DemandValues } from "../planner/steps";
import { formatRouting } from "../planner/parseSteps";

/**
 * The assessment as a document.
 *
 * The editor answers "what should I change next?"; this answers "what did we
 * decide, and why?" — so it is not the Analysis panel on a wider page. It reads
 * as a record: the brief that was given, the concepts that were compared and
 * which one was taken, the layout that came out, the assessment of it, and what
 * is still open. Everything is read-only; the editors that live in the panels
 * (weights, cost assumptions) have no place in a document someone else reads.
 *
 * It prints. The page is token-driven like the rest of the app, so `@media
 * print` re-points the Carbon layer tokens at a light palette and the same
 * markup comes out of the printer as a white sheet.
 */

const money = (cur: string, n: number) =>
  cur + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (cur: string, n: number) => cur + Math.round(n).toLocaleString();
const num = (n: number) => Math.round(n).toLocaleString();

export function ReportPage({
  api,
  picked,
  candidates,
  demand,
  portfolio,
}: {
  api: FlowPlanApi;
  picked: Candidate | null;
  candidates: Candidate[];
  demand: DemandValues;
  /** What the parts derive to — null when the cell was built by hand. */
  portfolio: PortfolioDerivation | null;
}) {
  const { TEAL } = useAccents();
  const model = api.model;
  const r = api.rating;
  const bal = r.balance;
  const cost = costAnalysis(model);
  const y = yieldAnalysis(model.stations, model.flows);
  const chain = api.chain;
  const process = model.stations.filter((s) => s.role === "process");
  const path = analysisPath(api);
  const improvements = findImprovements(model);
  const perShift = portfolio && demand.annualShifts > 0 ? portfolio.peakVolume / demand.annualShifts : 0;
  const printed = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  if (process.length === 0) {
    return (
      <div className="page rep">
        <ReportHead />
        <Tile className="rep__empty">
          <h2 className="rep__emptyTitle">Nothing to report</h2>
          <p>This cell has no process steps, so an empty plan would score a perfect grade.</p>
          <Btn variant="primary" onClick={() => navigate("/")}>Back to the editor</Btn>
        </Tile>
      </div>
    );
  }

  return (
    <div className="page rep">
      <ReportHead />

      <header className="rep__cover">
        <div>
          <h2 className="rep__title">{model.name}</h2>
          <p className="rep__meta">
            {demand.name} · {printed}
          </p>
        </div>
        <div className="rep__grade">
          <span className="rep__gradeLetter">{r.letter}</span>
          <span className="rep__gradeScore">
            {r.composite.toFixed(0)}
            <span className="rep__gradeMax">/100</span>
          </span>
        </div>
      </header>

      {/* The same six readings as the Analysis panel and the Summary glance, in
          the same order — the report is not a different verdict, it is the same
          one written down. */}
      <div className="rep__strip">
        {path.map((s, i) => (
          <div className="rep__stripItem" key={s.id}>
            <div className="rep__stripHead">
              <span className="rep__num">{i + 1}</span>
              {s.label}
            </div>
            <div className="rep__stripValue">{s.value}</div>
            <Tag type={s.tone} size="sm">
              {s.sub}
            </Tag>
          </div>
        ))}
      </div>

      {/* The brief is the part list. A single annual figure used to stand here,
          but the cell is sized against the busiest year of a portfolio now, so
          printing one averaged number would not be the number it was sized on. */}
      <Section n="1" title="The brief">
        <dl className="rep__facts">
          <Fact k="Program" v={demand.name} />
          <Fact k="Sized for" v={portfolio ? num(portfolio.peakVolume) + " parts, year " + portfolio.peakYear : "—"} />
          <Fact k="Program volume" v={portfolio ? num(portfolio.programVolume) + " parts" : "—"} />
          <Fact k="Program length" v={demand.programYears + " years"} />
          <Fact k="Shifts / year" v={num(demand.annualShifts)} />
          <Fact k="Shift length" v={demand.shiftHours + " h"} />
          <Fact k="Demand / shift" v={num(perShift) + " parts"} />
        </dl>
        {portfolio ? (
          <>
            <SectionLabel>Parts on this cell ({portfolio.years} program years)</SectionLabel>
            <table className="rep__table">
              <thead>
                <tr>
                  <th>Part number</th>
                  <th>Routing</th>
                  {Array.from({ length: portfolio.years }, (_, y) => (
                    <th key={y} className="rep__numCol">
                      Yr {y + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {demand.parts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.partNumber}</td>
                    <td>{formatRouting(p.steps)}</td>
                    {Array.from({ length: portfolio.years }, (_, y) => (
                      <td key={y} className="rep__numCol">
                        {num(p.demandByYear[y] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="rep__rowPick">
                  <td>Total</td>
                  <td>
                    {portfolio.steps.length} steps · {portfolio.modes.length} mix
                    {portfolio.modes.length === 1 ? "" : "es"}
                  </td>
                  {portfolio.totalByYear.map((t, y) => (
                    <td key={y} className="rep__numCol">
                      {num(t)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <Footnote>No parts were listed — the cell below was built by hand rather than from a brief.</Footnote>
        )}
      </Section>

      <Section n="2" title="The concept">
        {picked ? (
          <>
            <Tile className="rep__pick">
              <div className="rep__pickHead">
                <h4 className="rep__pickTitle">{picked.conceptLabel}</h4>
                <Tag type="blue" size="sm">
                  {FORM_LABELS[picked.form]}
                </Tag>
              </div>
              <p className="rep__pickWhy">{picked.rationale}</p>
              <dl className="rep__facts">
                <Fact k="Loaded cost / part" v={money(picked.cost.currency, picked.metrics.loadedCostPerPart)} />
                <Fact k="Capex" v={whole(picked.cost.currency, picked.metrics.capexTotal)} />
                <Fact k="Operators" v={String(picked.metrics.operators)} />
                <Fact k="Output" v={num(picked.metrics.lineOut) + " /shift"} />
              </dl>
            </Tile>
            {candidates.length > 1 ? (
              <>
                <SectionLabel>Alternatives considered</SectionLabel>
                <table className="rep__table">
                  <thead>
                    <tr>
                      <th>Concept</th>
                      <th>Form</th>
                      <th className="rep__numCol">Loaded / part</th>
                      <th className="rep__numCol">Capex</th>
                      <th className="rep__numCol">Ops</th>
                      <th className="rep__numCol">Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.slice(0, 8).map((c) => (
                      <tr key={c.id} className={c.id === picked.id ? "rep__rowPick" : undefined}>
                        <td>
                          {c.conceptLabel}
                          {c.id === picked.id ? <span className="rep__taken"> taken</span> : null}
                        </td>
                        <td>{FORM_LABELS[c.form]}</td>
                        <td className="rep__numCol">{money(c.cost.currency, c.metrics.loadedCostPerPart)}</td>
                        <td className="rep__numCol">{whole(c.cost.currency, c.metrics.capexTotal)}</td>
                        <td className="rep__numCol">{c.metrics.operators}</td>
                        <td className="rep__numCol">{num(c.metrics.lineOut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Footnote>
                  Concept figures are planning heuristics from the brief, not quotes. They rank options against each
                  other; the assessment below is measured on the layout as it now stands.
                </Footnote>
              </>
            ) : null}
          </>
        ) : (
          <Footnote>
            This cell was opened or built directly rather than chosen from generated concepts, so there is no comparison
            to record. Everything below still applies.
          </Footnote>
        )}
      </Section>

      <Section n="3" title="The layout" lead={`${model.stations.length} areas on a ${model.gridW}×${model.gridH} grid.`}>
        <div className="rep__canvas">
          <LayoutCanvas
            model={model}
            stations={model.stations}
            flows={model.flows}
            chain={chain}
            label="LAYOUT"
            badge={TEAL}
            cell={26}
          />
        </div>
      </Section>

      <Section n="4" title="The assessment">
        <SectionLabel>Rating breakdown</SectionLabel>
        <div className="rep__meters">
          <KpiMeter label="Material flow cost" score={r.scores.flowCost} raw={r.actual.flowCost.toFixed(0)} />
          <KpiMeter label="Total travel effort" score={r.scores.travel} raw={r.actual.travel.toFixed(0)} />
          <KpiMeter label="Aisle congestion" score={r.scores.congestion} raw={r.actual.congestion.toFixed(0)} />
          <KpiMeter label="Placement efficiency" score={r.scores.placement} />
          <KpiMeter label="Line balance" score={r.scores.balance} />
          <KpiMeter label="Ergonomics" score={r.scores.ergo} />
          <KpiMeter label="Automation coherence" score={r.scores.auto} />
        </div>

        <SectionLabel>Where the material cost sits</SectionLabel>
        {r.pareto.length === 0 ? (
          <Footnote>No material flows are drawn, so there is no transport cost to attribute.</Footnote>
        ) : (
          <div className="rep__bars">
            {r.pareto.slice(0, 6).map((p, i) => (
              <ShareBar
                key={i}
                label={p.from + " → " + p.to}
                value={p.share}
                figure={p.share.toFixed(0) + "%"}
                emphasis={
                  i === 0 ? (
                    <Tag type="red" size="sm">
                      biggest
                    </Tag>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}

        <SectionLabel>Throughput per step</SectionLabel>
        <table className="rep__table">
          <thead>
            <tr>
              <th>Step</th>
              <th className="rep__numCol">Cycle</th>
              <th className="rep__numCol">Units</th>
              <th className="rep__numCol">Parts / shift</th>
              <th className="rep__numCol">Util</th>
            </tr>
          </thead>
          <tbody>
            {bal.steps.map((s) => (
              <tr key={s.id} className={bal.bottleneck?.id === s.id ? "rep__rowFlag" : undefined}>
                <td>
                  {s.name}
                  {bal.bottleneck?.id === s.id ? (
                    <Tag type="red" size="sm">
                      bottleneck
                    </Tag>
                  ) : null}
                </td>
                <td className="rep__numCol">{s.cycle}s</td>
                <td className="rep__numCol">{s.units}</td>
                <td className="rep__numCol">{num(s.rate)}</td>
                <td className="rep__numCol">{Math.round(s.util)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Footnote>
          The line runs at {num(bal.lineOut)} parts/shift — the slowest step's rate. Takt ≈ {bal.takt}s per part
          {perShift > 0 ? ` against ${num(perShift)} demanded per shift.` : "."}
        </Footnote>

        <SectionLabel>Yield</SectionLabel>
        {y.totalScrap > 0 ? (
          <>
            <table className="rep__table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th className="rep__numCol">Scrap rate</th>
                  <th className="rep__numCol">Scrap / shift</th>
                  <th className="rep__numCol">Good out</th>
                </tr>
              </thead>
              <tbody>
                {y.steps
                  .filter((s) => s.scrapRate > 0)
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="rep__numCol">{(s.scrapRate * 100).toFixed(1)}%</td>
                      <td className="rep__numCol">{num(s.scrapUnits)}</td>
                      <td className="rep__numCol">{num(s.goodOut)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <Footnote>Rolled yield {y.rolledYield}% — {num(y.totalScrap)} parts scrapped per shift.</Footnote>
          </>
        ) : (
          <Footnote>
            No scrap rates were entered, so rolled yield reads 100%. That is an absence of data, not a claim about
            quality.
          </Footnote>
        )}

        <SectionLabel>Automation</SectionLabel>
        <Footnote>
          {chain.islands > 0
            ? `${chain.islands} auto-island(s): two automated steps joined by a manual handoff — the prime candidates for chaining.`
            : "No broken automation chains: nothing automated is separated by a manual handoff."}
        </Footnote>
        <table className="rep__table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Today</th>
              <th>Verdict</th>
              <th className="rep__numCol">Potential</th>
            </tr>
          </thead>
          <tbody>
            {process.map((s) => {
              const ap = autoPotential(s);
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.auto}</td>
                  <td>{ap.verdict}</td>
                  <td className="rep__numCol">
                    <Tag type={scoreTag(ap.pct)} size="sm">
                      {ap.pct.toFixed(0)}
                    </Tag>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <SectionLabel>Cost per part</SectionLabel>
        <dl className="rep__facts">
          <Fact k="Operating cost / part" v={money(cost.currency, cost.costPerPart)} />
          <Fact k="Labour / shift" v={whole(cost.currency, cost.laborPerShift)} />
          <Fact k="Transport / shift" v={whole(cost.currency, cost.transportPerShift)} />
          <Fact k="Energy / shift" v={whole(cost.currency, cost.energyPerShift)} />
          <Fact k="Opex / shift" v={whole(cost.currency, cost.opexPerShift)} />
          <Fact k="Equipment capex" v={whole(cost.currency, cost.capexTotal)} />
        </dl>
        <Footnote>
          Operating cost only — capex is listed but not amortised into the per-part figure here. Transport cost is the
          material-flow proxy, not a costed logistics model.
        </Footnote>
      </Section>

      <Section n="5" title="What is still open" lead="Ranked by what each would buy, highest first.">
        {improvements.improvements.length === 0 ? (
          <Footnote>{improvements.why}</Footnote>
        ) : (
          <ol className="rep__actions">
            {improvements.improvements.map((im, i) => (
              <li key={i}>
                <div className="rep__actionHead">
                  <h4 className="rep__actionTitle">{im.title}</h4>
                  <Tag type={im.confidence === "high" ? "green" : im.confidence === "med" ? "blue" : "gray"} size="sm">
                    {im.confidence} confidence
                  </Tag>
                </div>
                <p className="rep__actionBody">{im.detail}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Footnote>Recomputed from the layout as it stands now, by the engines the editor uses.</Footnote>
    </div>
  );
}

function ReportHead() {
  return (
    <div className="rep__head">
      <PageHead
        title="Assessment report"
        actions={
          <Btn variant="primary" size="compact" icon={Printer} onClick={() => window.print()}>
            Print
          </Btn>
        }
      />
    </div>
  );
}

function Section({ n, title, lead, children }: { n: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="rep__sec">
      <header className="rep__secHead">
        <h3 className="rep__secTitle">
          <span className="rep__num">{n}</span>
          {title}
        </h3>
        {lead ? <p className="rep__secLead">{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rep__fact">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
