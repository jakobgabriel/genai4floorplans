import { Tag, Tile } from "@carbon/react";
import { Printer } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { navigate } from "../store/useHashRoute";
import { PageHead } from "../components/PageHead";
import { Btn } from "../components/Btn";
import { LayoutCanvas } from "../components/LayoutCanvas";
import { MetricTile, KpiMeter, ShareBar, Footnote, scoreTag } from "../components/analysisKit";
import { KpiTile, DashCard as Card } from "../components/dashKit";
import { analysisPath } from "../components/analysisPath";
import { TEAL, AMBER, RED, scoreColor } from "../components/colors";
import { costAnalysis } from "@flowplan/core/engine/cost";
import { yieldAnalysis } from "@flowplan/core/engine/yield";
import { autoPotential } from "@flowplan/core/engine/automation";
import { findImprovements } from "@flowplan/core/engine/improve";
import type { Candidate } from "@flowplan/core/engine/generate";
import { FORM_LABELS } from "@flowplan/core/engine/templates";
import type { PortfolioDerivation } from "@flowplan/core/engine/parts";
import type { DemandValues } from "../planner/steps";
import { formatRouting } from "../planner/parseSteps";

/**
 * The assessment as a document — laid out as the analysis dashboard, not a
 * spreadsheet.
 *
 * The editor answers "what should I change next?"; this answers "what did we
 * decide, and why?". It reads as a record: the brief that was given, the
 * concepts compared and which was taken, the layout, its assessment, and what
 * is still open. Everything is read-only; the editors that live in the panels
 * (weights, cost assumptions) have no place in a document someone else reads.
 *
 * The visual language is the same airy Carbon dashboard the Analysis Overview
 * uses — a hero grade, a KPI band, and section cards of tiles and meters — so
 * the report and the live analysis read as one system.
 *
 * It prints. The page is token-driven, so `@media print` re-points the Carbon
 * layer tokens at a light palette and the same markup comes out as a white
 * sheet.
 */

const money = (cur: string, n: number) =>
  cur + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (cur: string, n: number) => cur + Math.round(n).toLocaleString();
const num = (n: number) => Math.round(n).toLocaleString();

const TONE_COLOR: Record<string, string | undefined> = { green: TEAL, blue: undefined, red: RED, gray: undefined };

/** A horizontal proportion bar — one row of a cost/space split. */
function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1e-9, parts.reduce((a, p) => a + p.value, 0));
  return (
    <div className="bi-split">
      <div className="bi-split__bar">
        {parts.map((p) => (
          <span
            key={p.label}
            className="bi-split__seg"
            style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
            title={`${p.label}: ${Math.round((p.value / total) * 100)}%`}
          />
        ))}
      </div>
      <div className="bi-legend">
        {parts.map((p) => (
          <span key={p.label} className="bi-legend__item">
            <span className="bi-legend__sw" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

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
  const model = api.model;
  const r = api.rating;
  const bal = r.balance;
  const cost = costAnalysis(model);
  const y = yieldAnalysis(model.stations, model.flows);
  const chain = api.chain;
  const process = model.stations.filter((s) => s.role === "process");
  const path = analysisPath(api);
  const improvements = findImprovements(model);
  const cur = cost.currency;
  const perShift = portfolio && demand.annualShifts > 0 ? portfolio.peakVolume / demand.annualShifts : 0;
  const printed = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  if (process.length === 0) {
    return (
      <div className="page bi rep">
        <ReportHead />
        <Tile className="bi-card bi-card--wide rep__empty">
          <h2 className="rep__emptyTitle">Nothing to report</h2>
          <p>This cell has no process steps, so an empty plan would score a perfect grade.</p>
          <Btn variant="primary" onClick={() => navigate("/")}>
            Back to the editor
          </Btn>
        </Tile>
      </div>
    );
  }

  // The verdict is the hero; the remaining readings from the same shared path
  // run across the KPI band, so the report opens on exactly the numbers the
  // Summary glance and Analysis panel show — the report is not a different
  // verdict, it is the same one written down.
  const bandReadings = path.filter((s) => s.id !== "verdict");

  return (
    <div className="page bi rep">
      <ReportHead />

      {/* ── top bar: hero grade + the headline readings ── */}
      <div className="bi__topbar rep__topbar">
        <Tile className="bi-hero">
          <div className="bi-hero__lab">{model.name}</div>
          <div className="bi-hero__grade" style={{ color: scoreColor(r.composite) }}>
            {r.letter}
          </div>
          <div className="bi-hero__score">
            {r.composite.toFixed(0)}
            <span> / 100</span>
          </div>
          <div className="bi-hero__sub">
            {demand.name} · {printed}
          </div>
        </Tile>
        <div className="bi-kpis">
          {bandReadings.map((s) => (
            <KpiTile key={s.id} label={s.label} value={s.value} sub={s.sub} color={TONE_COLOR[s.tone]} />
          ))}
        </div>
      </div>

      {/* ── 1 · the brief ── */}
      <Card n="1" title="The brief">
        <div className="bi-tiles">
          <MetricTile label="Program" value={demand.name} />
          <MetricTile label="Sized for" value={portfolio ? num(portfolio.peakVolume) : "—"} unit={portfolio ? `parts · yr ${portfolio.peakYear}` : ""} />
          <MetricTile label="Program volume" value={portfolio ? num(portfolio.programVolume) : "—"} unit="parts" />
          <MetricTile label="Program length" value={demand.programYears} unit="years" />
          <MetricTile label="Shifts / year" value={num(demand.annualShifts)} />
          <MetricTile label="Shift length" value={demand.shiftHours} unit="h" />
          <MetricTile label="Demand / shift" value={num(perShift)} unit="parts" />
        </div>
        {portfolio ? (
          <>
            <div className="bi-card__sublab">Parts on this cell — {portfolio.years} program years</div>
            <div className="rep__scroll">
              <table className="bi-tbl">
                <thead>
                  <tr>
                    <th>Part number</th>
                    <th>Routing</th>
                    {Array.from({ length: portfolio.years }, (_, yr) => (
                      <th key={yr} className="bi-tbl__num">
                        Yr {yr + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {demand.parts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.partNumber}</td>
                      <td>{formatRouting(p.steps)}</td>
                      {Array.from({ length: portfolio.years }, (_, yr) => (
                        <td key={yr} className="bi-tbl__num">
                          {num(p.demandByYear[yr] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bi-tbl__total">
                    <td>Total</td>
                    <td>
                      {portfolio.steps.length} steps · {portfolio.modes.length} mix
                      {portfolio.modes.length === 1 ? "" : "es"}
                    </td>
                    {portfolio.totalByYear.map((t, yr) => (
                      <td key={yr} className="bi-tbl__num">
                        {num(t)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Footnote>No parts were listed — the cell below was built by hand rather than from a brief.</Footnote>
        )}
      </Card>

      {/* ── 2 · the concept ── */}
      <Card n="2" title="The concept">
        {picked ? (
          <>
            <div className="rep__pickHead">
              <h4 className="rep__pickTitle">{picked.conceptLabel}</h4>
              <Tag type="blue" size="sm">
                {FORM_LABELS[picked.form]}
              </Tag>
            </div>
            <p className="rep__pickWhy">{picked.rationale}</p>
            <div className="bi-tiles">
              <MetricTile label="Loaded cost / part" value={money(picked.cost.currency, picked.metrics.loadedCostPerPart)} sub="incl. amortised capex" />
              <MetricTile label="Capex" value={whole(picked.cost.currency, picked.metrics.capexTotal)} />
              <MetricTile label="Operators" value={picked.metrics.operators} />
              <MetricTile label="Output" value={num(picked.metrics.lineOut)} unit="/shift" />
            </div>
            {candidates.length > 1 ? (
              <>
                <div className="bi-card__sublab">Alternatives considered</div>
                <div className="rep__scroll">
                  <table className="bi-tbl">
                    <thead>
                      <tr>
                        <th>Concept</th>
                        <th>Form</th>
                        <th className="bi-tbl__num">Loaded / part</th>
                        <th className="bi-tbl__num">Capex</th>
                        <th className="bi-tbl__num">Ops</th>
                        <th className="bi-tbl__num">Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.slice(0, 8).map((c) => (
                        <tr key={c.id} className={c.id === picked.id ? "bi-tbl__pick" : undefined}>
                          <td>
                            {c.conceptLabel}
                            {c.id === picked.id ? (
                              <Tag type="green" size="sm">
                                taken
                              </Tag>
                            ) : null}
                          </td>
                          <td>{FORM_LABELS[c.form]}</td>
                          <td className="bi-tbl__num">{money(c.cost.currency, c.metrics.loadedCostPerPart)}</td>
                          <td className="bi-tbl__num">{whole(c.cost.currency, c.metrics.capexTotal)}</td>
                          <td className="bi-tbl__num">{c.metrics.operators}</td>
                          <td className="bi-tbl__num">{num(c.metrics.lineOut)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
      </Card>

      {/* ── 3 · the layout ── */}
      <Card n="3" title="The layout" lead={`${model.stations.length} areas on a ${model.gridW}×${model.gridH} grid.`}>
        <div className="rep__canvas">
          <LayoutCanvas model={model} stations={model.stations} flows={model.flows} chain={chain} label="LAYOUT" badge={TEAL} cell={26} />
        </div>
      </Card>

      {/* ── 4 · the assessment ── */}
      <Card
        n="4"
        title="Rating breakdown"
        help="The weighted composite behind the grade — each KPI scored 0–100. Low bars are where the layout loses points."
      >
        <div className="rep__meters">
          <KpiMeter label="Material flow cost" score={r.scores.flowCost} raw={r.actual.flowCost.toFixed(0)} />
          <KpiMeter label="Total travel effort" score={r.scores.travel} raw={r.actual.travel.toFixed(0)} />
          <KpiMeter label="Aisle congestion" score={r.scores.congestion} raw={r.actual.congestion.toFixed(0)} />
          <KpiMeter label="Placement efficiency" score={r.scores.placement} />
          <KpiMeter label="Line balance" score={r.scores.balance} />
          <KpiMeter label="Ergonomics" score={r.scores.ergo} />
          <KpiMeter label="Automation coherence" score={r.scores.auto} />
        </div>
      </Card>

      <div className="bi__support rep__support">
        <Card wide={false} title="Where the material cost sits" help="Pareto of transport cost by flow — the biggest share is where re-placing stations saves the most.">
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
        </Card>

        <Card wide={false} title="Cost per part" help="Operating cost only — capex is listed but not amortised into the per-part figure here.">
          <SplitBar
            parts={[
              { label: `Labour ${whole(cur, cost.laborPerShift)}`, value: cost.laborPerShift, color: TEAL },
              { label: `Transport ${whole(cur, cost.transportPerShift)}`, value: cost.transportPerShift, color: AMBER },
              { label: `Energy ${whole(cur, cost.energyPerShift)}`, value: cost.energyPerShift, color: RED },
            ]}
          />
          <div className="bi-tiles">
            <MetricTile label="Operating / part" value={money(cur, cost.costPerPart)} />
            <MetricTile label="Opex / shift" value={whole(cur, cost.opexPerShift)} />
            <MetricTile label="Equipment capex" value={whole(cur, cost.capexTotal)} />
          </div>
        </Card>
      </div>

      <Card title="Throughput per step" help={`The line runs at the slowest step's rate — ${num(bal.lineOut)} parts/shift, takt ≈ ${bal.takt}s.`}>
        <div className="rep__scroll">
          <table className="bi-tbl">
            <thead>
              <tr>
                <th>Step</th>
                <th className="bi-tbl__num">Cycle</th>
                <th className="bi-tbl__num">Units</th>
                <th className="bi-tbl__num">Parts / shift</th>
                <th className="bi-tbl__num">Util</th>
              </tr>
            </thead>
            <tbody>
              {bal.steps.map((s) => (
                <tr key={s.id} className={bal.bottleneck?.id === s.id ? "bi-tbl__flag" : undefined}>
                  <td>
                    {s.name}
                    {bal.bottleneck?.id === s.id ? (
                      <Tag type="red" size="sm">
                        bottleneck
                      </Tag>
                    ) : null}
                  </td>
                  <td className="bi-tbl__num">{s.cycle}s</td>
                  <td className="bi-tbl__num">{s.units}</td>
                  <td className="bi-tbl__num">{num(s.rate)}</td>
                  <td className="bi-tbl__num">{Math.round(s.util)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Footnote>
          {perShift > 0
            ? `${num(bal.lineOut)} made against ${num(perShift)} demanded per shift.`
            : "No demand figure to compare the line rate against."}
        </Footnote>
      </Card>

      <div className="bi__support rep__support">
        <Card wide={false} title="Yield" help="Rolled throughput yield — the compounded good-part fraction across every step that scraps.">
          {y.totalScrap > 0 ? (
            <>
              <div className="rep__scroll">
                <table className="bi-tbl">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th className="bi-tbl__num">Scrap rate</th>
                      <th className="bi-tbl__num">Scrap / shift</th>
                      <th className="bi-tbl__num">Good out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {y.steps
                      .filter((s) => s.scrapRate > 0)
                      .map((s) => (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td className="bi-tbl__num">{(s.scrapRate * 100).toFixed(1)}%</td>
                          <td className="bi-tbl__num">{num(s.scrapUnits)}</td>
                          <td className="bi-tbl__num">{num(s.goodOut)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <Footnote>
                Rolled yield {y.rolledYield}% — {num(y.totalScrap)} parts scrapped per shift.
              </Footnote>
            </>
          ) : (
            <Footnote>
              No scrap rates were entered, so rolled yield reads 100%. That is an absence of data, not a claim about
              quality.
            </Footnote>
          )}
        </Card>

        <Card wide={false}
          title="Automation"
          help={
            chain.islands > 0
              ? `${chain.islands} auto-island(s): two automated steps joined by a manual handoff — the prime candidates for chaining.`
              : "No broken automation chains: nothing automated is separated by a manual handoff."
          }
        >
          <div className="rep__scroll">
            <table className="bi-tbl">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Today</th>
                  <th>Verdict</th>
                  <th className="bi-tbl__num">Potential</th>
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
                      <td className="bi-tbl__num">
                        <Tag type={scoreTag(ap.pct)} size="sm">
                          {ap.pct.toFixed(0)}
                        </Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ── 5 · what is still open ── */}
      <Card n="5" title="What is still open" lead="Ranked by what each would buy, highest first.">
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
      </Card>

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
