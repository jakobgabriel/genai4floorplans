import { useMemo } from "react";
import { Tile } from "@carbon/react";
import { cycleAnalysis } from "@flowplan/core/engine/cycle";
import { classifyFreedom, type FreedomFinding } from "@flowplan/core/engine/freedom";
import { costAnalysis } from "@flowplan/core/engine/cost";
import { YamazumiChart } from "./charts";
import { DagView } from "./DagView";
import { OpenPointsSection, ImprovementList, type PanelProps } from "./panels";
import { AMBER, CYCLE_COL, RED, TEAL, TEXTD, scoreColor } from "./colors";
import { HelpPopover } from "./ui";

// The Analysis "Overview" as a readable Carbon dashboard rather than dense
// tables: a strip of stat tiles, the Yamazumi front-and-centre, the precedence
// graph with its freedom summary, and the actionable open-points / improvements.
// Every figure is derived from pieces that already exist (rating, cycle, cost,
// freedom) — this component only arranges them.

const FREEDOM_COL: Record<FreedomFinding, string> = { free: TEAL, swappable: AMBER, exclusive: "#a582c9", compulsory: TEXTD };

function DashTile({ label, value, sub, color, help }: { label: string; value: string; sub?: string; color?: string; help?: string }) {
  return (
    <Tile className="dash-tile">
      <div className="dash-tile__lab">
        {label}
        {help ? <HelpPopover text={help} /> : null}
      </div>
      <div className="dash-tile__val" style={{ color }}>{value}</div>
      {sub ? <div className="dash-tile__sub">{sub}</div> : null}
    </Tile>
  );
}

export function AnalysisDashboard(props: PanelProps) {
  const { api, setSel, setTab, setView } = props;
  const { model, rating } = api;
  const takt = rating.balance.takt;

  const cycle = useMemo(() => cycleAnalysis(model.stations, takt), [model.stations, takt]);
  const cost = useMemo(() => costAnalysis(model), [model]);
  const freedom = useMemo(
    () => classifyFreedom(model.workElements ?? [], model.variantModes),
    [model.workElements, model.variantModes],
  );

  const bottleneck = rating.balance.bottleneck;
  const overTakt = bottleneck && takt > 0 ? bottleneck.cycle - takt : 0;
  const money = (n: number) => cost.currency + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="dashboard">
      {/* Stat strip — the headline numbers, readable at a glance. */}
      <div className="dash-grid">
        <DashTile
          label="Rating"
          value={`${rating.letter} · ${rating.composite.toFixed(0)}`}
          sub="composite / 100"
          color={scoreColor(rating.composite)}
          help="Weighted composite of the seven KPIs. The letter grade maps A≥90 … E<60."
        />
        <DashTile
          label="Output / shift"
          value={rating.balance.lineOut.toLocaleString()}
          sub={`takt ${takt > 0 ? takt.toFixed(1) + "s" : "—"}`}
          help="Line throughput per shift, gated by the slowest step. Takt is the pace demand requires."
        />
        <DashTile
          label="Bottleneck"
          value={bottleneck ? bottleneck.name : "—"}
          sub={bottleneck ? `${bottleneck.cycle.toFixed(1)}s cycle${overTakt > 0 ? ` · +${overTakt.toFixed(1)}s over takt` : ""}` : "no steps"}
          color={overTakt > 0 ? RED : undefined}
          help="The step that sets the line rate. Anything above takt cannot meet demand without more work or a lane."
        />
        <DashTile
          label="Line balance"
          value={rating.scores.balance.toFixed(0)}
          sub="score / 100"
          color={scoreColor(rating.scores.balance)}
          help="Line output ÷ mean step rate — how evenly work is spread across the stations."
        />
        <DashTile
          label="Value-add ratio"
          value={cycle.lineValueAddPct != null ? cycle.lineValueAddPct + "%" : "—"}
          sub={cycle.lineValueAddPct != null ? `${cycle.decomposedCount}/${cycle.totalCount} steps decomposed` : "decompose cycles to see"}
          color={cycle.lineValueAddPct != null ? scoreColor(cycle.lineValueAddPct) : undefined}
          help="Share of decomposed cycle time that adds value; the rest is handling, walk, wait and setup."
        />
        <DashTile
          label="Cost / part"
          value={money(cost.costPerPart)}
          sub={`LDC ${money(cost.ldcPerPart)} · MDC ${money(cost.mdcPerPart)}`}
          help="Operating cost per part at the current line output. LDC = labour-dependent, MDC = machine-dependent."
        />
      </div>

      {/* Yamazumi — cycle time per station vs takt, the lean workhorse. */}
      <div className="dash-panel">
        <div className="dash-panel__head">
          <span className="lab">Yamazumi — cycle time by station</span>
          <div className="dash-legend">
            {(Object.keys(CYCLE_COL) as (keyof typeof CYCLE_COL)[]).map((k) => (
              <span key={k} className="dash-legend__item">
                <span className="dash-legend__sw" style={{ background: CYCLE_COL[k] }} />
                {k.replace(/Sec$/, "").replace(/([A-Z])/g, " $1").trim()}
              </span>
            ))}
          </div>
        </div>
        {cycle.stations.length > 0 ? (
          <YamazumiChart rows={cycle.stations} takt={takt > 0 ? takt : undefined} onSelect={(id) => { setView("actual"); setSel(id); setTab("inspect"); }} />
        ) : (
          <div className="dash-empty">Add process steps to see the balance.</div>
        )}
        {cycle.decomposedCount < cycle.totalCount ? (
          <div className="dash-note">
            {cycle.totalCount - cycle.decomposedCount} of {cycle.totalCount} steps are not decomposed — hatched bars carry only a total. Split their cycle in Configure to see value-add vs waste.
          </div>
        ) : null}
      </div>

      {/* Precedence graph + freedom-finding — where the placement slack lives. */}
      <div className="dash-panel">
        <div className="dash-panel__head">
          <span className="lab">
            Precedence graph
            <HelpPopover text="The real ordering constraints between operations. Columns are process layers; free/swappable operations are the balancing slack the tool exists to surface." />
          </span>
          {freedom.elements.length > 0 ? (
            <div className="dash-legend">
              {(["free", "swappable", "exclusive", "compulsory"] as FreedomFinding[]).map((k) =>
                freedom.counts[k] > 0 ? (
                  <span key={k} className="dash-legend__item" style={{ color: FREEDOM_COL[k] }}>
                    {freedom.counts[k]} {k}
                  </span>
                ) : null,
              )}
            </div>
          ) : null}
        </div>
        <div className="dash-dag">
          <DagView model={model} chain={api.chain} selId={props.selId} onSelect={(id) => { setView("actual"); setSel(id); setTab("inspect"); }} criticalPath={rating.balance.criticalPath} />
        </div>
      </div>

      {/* Actionable backlog — open points and ranked improvements. */}
      <div className="dash-panel">
        <OpenPointsSection api={api} setSel={setSel} setTab={setTab} />
        <ImprovementList api={api} setSel={setSel} setTab={setTab} setView={setView} />
      </div>
    </div>
  );
}
