import { useMemo, type ReactNode } from "react";
import { Tile } from "@carbon/react";
import { cycleAnalysis } from "@flowplan/core/engine/cycle";
import { isFlowFunction } from "@flowplan/core/model/types";
import { classifyFreedom, type FreedomFinding } from "@flowplan/core/engine/freedom";
import { costAnalysis } from "@flowplan/core/engine/cost";
import { YamazumiChart, BarChart } from "./charts";
import { DagView } from "./DagView";
import { OpenPointsSection, ImprovementList, type PanelProps } from "./panels";
import { AMBER, CYCLE_COL, PURPLE, RED, TEAL, TEXTD, scoreColor } from "./colors";
import { HelpPopover } from "./ui";

// The Analysis "Overview" as a real business-analytics dashboard: a KPI band,
// then the Yamazumi front-and-centre (large, vertical), a cost/balance row, the
// precedence graph, and the actionable backlog. Every figure is derived from
// pieces that already exist (rating, cycle, cost, freedom); this only arranges
// them into a consistent grid of Carbon Tiles.

const FREEDOM_COL: Record<FreedomFinding, string> = { free: TEAL, swappable: AMBER, exclusive: PURPLE, compulsory: TEXTD };
const CYCLE_LABEL: Record<keyof typeof CYCLE_COL, string> = {
  valueAddSec: "Value add",
  handlingSec: "Handling",
  walkSec: "Walk",
  waitSec: "Wait",
  setupSec: "Setup",
};

function KpiTile({ label, value, sub, color, help }: { label: string; value: string; sub?: string; color?: string; help?: string }) {
  return (
    <Tile className="bi-kpi">
      <div className="bi-kpi__lab">
        {label}
        {help ? <HelpPopover text={help} /> : null}
      </div>
      <div className="bi-kpi__val" style={{ color }}>{value}</div>
      {sub ? <div className="bi-kpi__sub">{sub}</div> : null}
    </Tile>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="bi-legend">
      {items.map((it) => (
        <span key={it.label} className="bi-legend__item">
          <span className="bi-legend__sw" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({ title, help, legend, children, wide }: { title: string; help?: string; legend?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <Tile className={"bi-card" + (wide ? " bi-card--wide" : "")}>
      <div className="bi-card__head">
        <h3 className="bi-card__title">
          {title}
          {help ? <HelpPopover text={help} /> : null}
        </h3>
        {legend}
      </div>
      {children}
    </Tile>
  );
}

/** A horizontal proportion bar (Carbon-square, tokenised) — one row of the cost split. */
function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1e-9, parts.reduce((a, p) => a + p.value, 0));
  return (
    <div className="bi-split">
      <div className="bi-split__bar">
        {parts.map((p) => (
          <span key={p.label} className="bi-split__seg" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${Math.round((p.value / total) * 100)}%`} />
        ))}
      </div>
      <Legend items={parts.map((p) => ({ color: p.color, label: p.label }))} />
    </div>
  );
}

export function AnalysisDashboard(props: PanelProps) {
  const { api, setSel, setTab, setView } = props;
  const { model, rating } = api;
  const takt = rating.balance.takt;

  const cycle = useMemo(() => cycleAnalysis(model.stations, takt), [model.stations, takt]);
  const cost = useMemo(() => costAnalysis(model), [model]);
  const freedom = useMemo(() => classifyFreedom(model.workElements ?? [], model.variantModes), [model.workElements, model.variantModes]);

  const bottleneck = rating.balance.bottleneck;
  const overTakt = bottleneck && takt > 0 ? bottleneck.cycle - takt : 0;
  const money = (n: number) => cost.currency + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const openStation = (id: string) => { setView("actual"); setSel(id); setTab("inspect"); };

  // Material flow & distance — layout optimisation minimises material travel.
  // The heaviest flows (volume × rectilinear distance) are where re-placing
  // stations saves the most; all from the engine's existing flow detail.
  const nameOf = (id: string) => model.stations.find((s) => s.id === id)?.name ?? id;

  // Flow functions in the cell — buffers/stores that decouple the flow and hold
  // WIP without being work steps. Surfaced so a real material flow reads honestly.
  const buffers = model.stations.filter((s) => s.role === "process" && isFlowFunction(s));
  const totalWip = buffers.reduce((a, s) => a + (s.bufferCapacity ?? 0), 0);

  const flowBars = [...(rating.actual.flowDetail ?? [])]
    .filter((f) => f.travel > 0)
    .sort((a, b) => b.travel - a.travel)
    .slice(0, 6)
    .map((f) => ({ label: `${nameOf(f.from)} → ${nameOf(f.to)}`, value: f.travel, display: `${f.dist} × ${f.volume.toLocaleString()}`, color: TEAL }));

  const cycleLegend = <Legend items={(Object.keys(CYCLE_COL) as (keyof typeof CYCLE_COL)[]).map((k) => ({ color: CYCLE_COL[k], label: CYCLE_LABEL[k] }))} />;

  return (
    // F-pattern: the eye lands top-left and sweeps right, then down the left
    // edge. So the hero grade anchors top-left, the headline KPIs run across the
    // top bar, the primary chart (Yamazumi) leads the tall left column with the
    // key optimisation signal beside it, and the least glance-critical panels
    // (structure, backlog) sit at the bottom.
    <div className="bi">
      {/* ── top bar of the F: hero grade + headline KPIs ── */}
      <div className="bi__topbar">
        <Tile className="bi-hero">
          <div className="bi-hero__lab">Layout rating</div>
          <div className="bi-hero__grade" style={{ color: scoreColor(rating.composite) }}>{rating.letter}</div>
          <div className="bi-hero__score">{rating.composite.toFixed(0)}<span> / 100</span></div>
          <div className="bi-hero__sub">weighted composite of 7 KPIs · A≥90 … E&lt;60</div>
        </Tile>
        <div className="bi-kpis">
          <KpiTile label="Output / shift" value={rating.balance.lineOut.toLocaleString()} sub={`takt ${takt > 0 ? takt.toFixed(1) + "s" : "—"}`} help="Line throughput per shift, gated by the slowest step." />
          <KpiTile label="Bottleneck" value={bottleneck ? bottleneck.name : "—"} sub={bottleneck ? `${bottleneck.cycle.toFixed(1)}s${overTakt > 0 ? ` · +${overTakt.toFixed(1)}s over takt` : ""}` : "no steps"} color={overTakt > 0 ? RED : undefined} help="The step that sets the line rate. Above takt cannot meet demand without more work or a lane." />
          <KpiTile label="Line balance" value={rating.scores.balance.toFixed(0)} sub="score / 100" color={scoreColor(rating.scores.balance)} help="How evenly work is spread across the stations." />
          <KpiTile label="Value-add ratio" value={cycle.lineValueAddPct != null ? cycle.lineValueAddPct + "%" : "—"} sub={cycle.lineValueAddPct != null ? `${cycle.decomposedCount}/${cycle.totalCount} decomposed` : "decompose cycles"} color={cycle.lineValueAddPct != null ? scoreColor(cycle.lineValueAddPct) : undefined} help="Share of decomposed cycle time that adds value." />
          <KpiTile label="Cost / part" value={money(cost.costPerPart)} sub={`LDC ${money(cost.ldcPerPart)} · MDC ${money(cost.mdcPerPart)}`} help="Operating cost per part at the current line output." />
        </div>
      </div>

      {/* ── the primary chart, across the FULL width — the Yamazumi is the panel
             an IE reads first, so it uses the whole layout area ── */}
      <ChartCard title="Yamazumi — cycle time by station" help="Per-station cycle stacked by value-add and waste, against takt. Bars over the takt line cannot meet demand." legend={cycleLegend} wide>
        {cycle.stations.length > 0 ? (
          <div className="bi-scroll">
            <YamazumiChart rows={cycle.stations} takt={takt > 0 ? takt : undefined} onSelect={openStation} />
          </div>
        ) : (
          <p className="bi-empty">Add process steps to see the balance.</p>
        )}
        {cycle.decomposedCount < cycle.totalCount ? (
          <p className="bi-note">{cycle.totalCount - cycle.decomposedCount} of {cycle.totalCount} steps are not decomposed — hatched columns carry only a total. Split their cycle in Configure to see value-add vs waste.</p>
        ) : null}
      </ChartCard>

      {/* ── supporting row: the optimisation signal + the cost/space breakdowns ── */}
      <div className="bi__support">
        <ChartCard title="Material flow & distance" help="Layout optimisation minimises material travel. Total travel = Σ(volume × rectilinear distance). The heaviest flows are where re-placing stations saves the most; distance is in grid cells (× volume/shift).">
          <div className="bi-flowkpis">
            <span className="bi-flowkpi"><span className="bi-flowkpi__lab">Total travel</span><span className="bi-flowkpi__val">{Math.round(rating.actual.travel).toLocaleString()}</span> cell·moves/shift</span>
            <span className="bi-flowkpi"><span className="bi-flowkpi__lab">Placement</span><span className="bi-flowkpi__val" style={{ color: scoreColor(rating.scores.placement) }}>{rating.scores.placement.toFixed(0)}</span> / 100</span>
            <span className="bi-flowkpi"><span className="bi-flowkpi__lab">Flow cost</span><span className="bi-flowkpi__val">{Math.round(rating.actual.flowCost).toLocaleString()}</span></span>
            {buffers.length > 0 ? (
              <span className="bi-flowkpi"><span className="bi-flowkpi__lab">Buffers / WIP</span><span className="bi-flowkpi__val" style={{ color: TEAL }}>{buffers.length}</span> · {totalWip.toLocaleString()} pcs</span>
            ) : null}
          </div>
          {flowBars.length ? (
            <>
              <div className="bi-card__sublab">Heaviest flows — distance × volume</div>
              <div className="bi-scroll"><BarChart bars={flowBars} /></div>
            </>
          ) : (
            <p className="bi-empty">No inter-station material flows yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Cost per part — labour vs machine" help="LDC = labour-dependent (operator time). MDC = machine-dependent (energy + transport). Together they make the operating cost per part.">
          <SplitBar parts={[{ label: `LDC ${money(cost.ldcPerPart)}`, value: cost.ldcPerPart, color: TEAL }, { label: `MDC ${money(cost.mdcPerPart)}`, value: cost.mdcPerPart, color: AMBER }]} />
          <div className="bi-note">Total operating {money(cost.costPerPart)}/part · opex {money(cost.opexPerShift)}/shift · capex {money(cost.capexTotal)}.</div>
        </ChartCard>

        <ChartCard title="Floor space" help="Cell = the area the stations occupy. Material supply = bins + replenishment, routinely forgotten and worth about a third more.">
          <SplitBar
            parts={[
              { label: `Cell ${cost.floorSpace.cell.toLocaleString()}`, value: cost.floorSpace.cell, color: TEAL },
              { label: `Supply +${cost.floorSpace.materialSupply.toLocaleString()}`, value: cost.floorSpace.materialSupply, color: AMBER },
              ...(cost.floorSpace.reserved > 0 ? [{ label: `Reserved +${cost.floorSpace.reserved.toLocaleString()}`, value: cost.floorSpace.reserved, color: PURPLE }] : []),
            ]}
          />
          <div className="bi-note">Total footprint {cost.floorSpace.total.toLocaleString()} {cost.floorSpace.unit}.</div>
        </ChartCard>
      </div>

      {/* ── bottom of the F: least glance-critical — structure & actions ── */}
      <div className="bi__bottom">
        <ChartCard
          title="Precedence graph"
          help="The real ordering constraints between operations. Columns are process layers; free/swappable operations are the balancing slack the tool exists to surface."
          legend={
            freedom.elements.length > 0 ? (
              <div className="bi-legend">
                {(["free", "swappable", "exclusive", "compulsory"] as FreedomFinding[]).map((k) =>
                  freedom.counts[k] > 0 ? (
                    <span key={k} className="bi-legend__item" style={{ color: FREEDOM_COL[k] }}>
                      <span className="bi-legend__sw" style={{ background: FREEDOM_COL[k] }} />
                      {freedom.counts[k]} {k}
                    </span>
                  ) : null,
                )}
              </div>
            ) : undefined
          }
          wide
        >
          <div className="bi-scroll">
            <DagView model={model} chain={api.chain} selId={props.selId} onSelect={openStation} criticalPath={rating.balance.criticalPath} />
          </div>
        </ChartCard>

        <Tile className="bi-card bi-card--wide">
          <OpenPointsSection api={api} setSel={setSel} setTab={setTab} />
          <ImprovementList api={api} setSel={setSel} setTab={setTab} setView={setView} />
        </Tile>
      </div>
    </div>
  );
}
