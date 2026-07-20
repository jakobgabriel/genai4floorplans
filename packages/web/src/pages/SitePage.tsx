import { Fragment, useMemo, type ReactNode } from "react";
import { Button } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { buildRating } from "@flowplan/core/engine/rating";
import { costAnalysis } from "@flowplan/core/engine/cost";
import { navigate } from "../store/useHashRoute";
import { BarChart, Stat, type Bar } from "../components/charts";
import { scoreColor, TEAL, TEXTD } from "../components/colors";

// Dedicated full-page site rollup across all layouts (cells): summary stats,
// charts (score / throughput / cost per layout), and a per-layout table grouped
// by folder. Each layout is rated independently — inter-cell flow isn't modeled.
export function SitePage({ api }: { api: FlowPlanApi }) {
  const folderPath = useMemo(() => {
    const byId = new Map(api.folders.map((f) => [f.id, f]));
    return (id: string | null): string => {
      const parts: string[] = [];
      let cur = id;
      while (cur) { const f = byId.get(cur); if (!f) break; parts.unshift(f.name); cur = f.parentId; }
      return parts.join(" / ");
    };
  }, [api.folders]);

  const rows = useMemo(
    () =>
      api.snapshotCells().map((c) => {
        const r = buildRating(c.model);
        const cost = costAnalysis(c.model);
        return { id: c.id, name: c.name, folderId: c.folderId, letter: r.letter, composite: r.composite, lineOut: r.balance.lineOut, costPerPart: cost.costPerPart, currency: cost.currency };
      }),
    [api],
  );

  const cur = rows[0]?.currency ?? "$";
  const totalThroughput = rows.reduce((a, r) => a + r.lineOut, 0);
  const avgGrade = rows.length ? rows.reduce((a, r) => a + r.composite, 0) / rows.length : 0;
  const avgCost = rows.length ? rows.reduce((a, r) => a + r.costPerPart, 0) / rows.length : 0;

  const scoreBars: Bar[] = rows.map((r) => ({ label: r.name, value: r.composite, color: scoreColor(r.composite), highlight: r.id === api.activeId }));
  const flowBars: Bar[] = rows.map((r) => ({ label: r.name, value: r.lineOut, highlight: r.id === api.activeId }));
  const costBars: Bar[] = rows.map((r) => ({ label: r.name, value: r.costPerPart, display: cur + r.costPerPart.toLocaleString(undefined, { maximumFractionDigits: 2 }), highlight: r.id === api.activeId }));

  // group rows by folder path for the table
  const groups = useMemo(() => {
    const by = new Map<string, typeof rows>();
    for (const r of rows) { const k = r.folderId ?? ""; (by.get(k) ?? by.set(k, []).get(k)!).push(r); }
    return Array.from(by.entries()).map(([fid, items]) => ({ label: fid ? folderPath(fid) : "", items })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, folderPath]);

  return (
    <div className="page">
      <div className="page-head">
        <Button size="sm" kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate("/")}>Editor</Button>
        <h1 className="page-title">Site overview</h1>
      </div>

      <div className="stat-strip">
        <Stat label="Layouts" value={String(rows.length)} />
        <Stat label="Total throughput" value={totalThroughput.toLocaleString()} sub="parts / shift" color={TEAL} />
        <Stat label="Avg grade" value={avgGrade.toFixed(0)} color={scoreColor(avgGrade)} />
        <Stat label="Avg cost / part" value={cur + avgCost.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
      </div>

      <div className="page-grid">
        <div className="chart-card">
          <div className="layoutTitle">Score per layout</div>
          <BarChart bars={scoreBars} max={100} colorByScore />
        </div>
        <div className="chart-card">
          <div className="layoutTitle">Throughput per layout</div>
          <BarChart bars={flowBars} />
        </div>
        <div className="chart-card">
          <div className="layoutTitle">Cost / part per layout</div>
          <BarChart bars={costBars} />
        </div>
      </div>

      <div className="chart-card">
        <div className="layoutTitle">Layouts</div>
        <table className="schemaTbl">
          <thead>
            <tr><th>Layout</th><th>Grade</th><th>Score</th><th>Parts/shift</th><th>Cost/part</th><th></th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FolderGroup key={g.label || "__root"} label={g.label}>
                {g.items.map((r) => (
                  <tr key={r.id}>
                    <td style={{ color: r.id === api.activeId ? TEAL : undefined, paddingLeft: g.label ? 16 : undefined }}>{r.name}</td>
                    <td style={{ color: scoreColor(r.composite), fontWeight: 600 }}>{r.letter}</td>
                    <td>{r.composite.toFixed(0)}</td>
                    <td>{r.lineOut.toLocaleString()}</td>
                    <td>{cur}{r.costPerPart.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td>
                      {r.id === api.activeId ? <span style={{ color: TEXTD }}>active</span> : (
                        <Button size="sm" kind="tertiary" onClick={() => { api.switchCell(r.id); navigate("/"); }}>Open</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </FolderGroup>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 10.5, color: TEXTD }}>Each layout is rated independently by the engine. Inter-cell material flow isn't modeled.</div>
      </div>
    </div>
  );
}

function FolderGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Fragment>
      {label ? (
        <tr><td colSpan={6} style={{ color: TEXTD, fontWeight: 600, paddingTop: 8 }}>🗀 {label}</td></tr>
      ) : null}
      {children}
    </Fragment>
  );
}
