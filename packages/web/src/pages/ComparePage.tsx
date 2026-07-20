import { useMemo } from "react";
import { Button, StructuredListWrapper, StructuredListHead, StructuredListBody, StructuredListRow, StructuredListCell } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import type { Model } from "@flowplan/core/model/types";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { buildRating } from "@flowplan/core/engine/rating";
import { costAnalysis } from "@flowplan/core/engine/cost";
import { listScenarios, loadScenario } from "../store/scenarios";
import { navigate } from "../store/useHashRoute";
import { useToast } from "../components/ui";
import { BarChart, Stat, type Bar } from "../components/charts";
import { scoreColor, TEAL, TEXTD } from "../components/colors";

// Dedicated full-page scenario comparison: a KPI table (best-in-column),
// summary stats, and charts across the current layout + all saved scenarios.
export function ComparePage({ api }: { api: FlowPlanApi }) {
  const { toast } = useToast();

  const folderPath = useMemo(() => {
    const byId = new Map(api.folders.map((f) => [f.id, f]));
    return (id: string | null): string => {
      const parts: string[] = [];
      let cur = id;
      while (cur) { const f = byId.get(cur); if (!f) break; parts.unshift(f.name); cur = f.parentId; }
      return parts.join(" / ");
    };
  }, [api.folders]);

  const rated = useMemo(() => {
    const saved = listScenarios().map((s) => ({ name: s.name, model: loadScenario(s.name), isCurrent: false, folderId: s.folderId }));
    const rows = [{ name: api.model.name + " (current)", model: api.model as Model, isCurrent: true, folderId: null as string | null }, ...saved];
    return rows
      .filter((r) => r.model)
      .map((r) => ({ ...r, rating: buildRating(r.model as Model), cost: costAnalysis(r.model as Model) }));
  }, [api.model]);

  const cols: Array<{ key: string; label: string; get: (x: (typeof rated)[number]) => number; fmt?: (n: number) => string }> = [
    { key: "composite", label: "Score", get: (x) => x.rating.composite },
    { key: "flowCost", label: "Flow", get: (x) => x.rating.scores.flowCost },
    { key: "travel", label: "Travel", get: (x) => x.rating.scores.travel },
    { key: "congestion", label: "Congest", get: (x) => x.rating.scores.congestion },
    { key: "balance", label: "Balance", get: (x) => x.rating.scores.balance },
    { key: "ergo", label: "Ergo", get: (x) => x.rating.scores.ergo },
    { key: "auto", label: "Auto", get: (x) => x.rating.scores.auto },
    { key: "lineOut", label: "Parts/sh", get: (x) => x.rating.balance.lineOut, fmt: (n) => n.toLocaleString() },
  ];
  const bestByCol: Record<string, number> = {};
  cols.forEach((c) => (bestByCol[c.key] = Math.max(...rated.map((x) => c.get(x)))));

  if (rated.length <= 1) {
    return (
      <div className="page">
        <PageHead />
        <p style={{ color: TEXTD }}>Save a few variants (Flow ▸ Scenarios) to compare them here side by side with charts and statistics.</p>
      </div>
    );
  }

  const scoreBars: Bar[] = rated.map((x) => ({ label: x.name, value: x.rating.composite, highlight: x.isCurrent, color: scoreColor(x.rating.composite) }));
  const throughputBars: Bar[] = rated.map((x) => ({ label: x.name, value: x.rating.balance.lineOut, highlight: x.isCurrent }));
  const best = rated.reduce((a, b) => (b.rating.composite > a.rating.composite ? b : a));
  const avg = rated.reduce((s, x) => s + x.rating.composite, 0) / rated.length;
  const bestFlow = rated.reduce((a, b) => (b.rating.balance.lineOut > a.rating.balance.lineOut ? b : a));

  return (
    <div className="page">
      <PageHead />
      <div className="stat-strip">
        <Stat label="Scenarios" value={String(rated.length)} />
        <Stat label="Best score" value={best.rating.composite.toFixed(0)} sub={best.name} color={scoreColor(best.rating.composite)} />
        <Stat label="Average score" value={avg.toFixed(0)} color={scoreColor(avg)} />
        <Stat label="Best throughput" value={bestFlow.rating.balance.lineOut.toLocaleString()} sub={bestFlow.name + " /shift"} color={TEAL} />
      </div>

      <div className="page-grid">
        <div className="chart-card">
          <div className="layoutTitle">Composite score</div>
          <BarChart bars={scoreBars} max={100} colorByScore />
        </div>
        <div className="chart-card">
          <div className="layoutTitle">Throughput (parts / shift)</div>
          <BarChart bars={throughputBars} />
        </div>
      </div>

      <div className="chart-card" style={{ overflowX: "auto" }}>
        <div className="layoutTitle">KPI breakdown</div>
        <StructuredListWrapper isCondensed style={{ minWidth: 620 }}>
          <StructuredListHead>
            <StructuredListRow head>
              <StructuredListCell head>Scenario</StructuredListCell>
              <StructuredListCell head>Grade</StructuredListCell>
              {cols.map((c) => (<StructuredListCell head key={c.key}>{c.label}</StructuredListCell>))}
              <StructuredListCell head></StructuredListCell>
            </StructuredListRow>
          </StructuredListHead>
          <StructuredListBody>
            {rated.map((x) => (
              <StructuredListRow key={x.name}>
                <StructuredListCell style={{ color: x.isCurrent ? TEAL : undefined }}>
                  {x.name}
                  {x.folderId ? <span style={{ color: TEXTD, fontSize: 10 }}> · 🗀 {folderPath(x.folderId)}</span> : null}
                </StructuredListCell>
                <StructuredListCell style={{ color: scoreColor(x.rating.composite), fontWeight: 600 }}>{x.rating.letter}</StructuredListCell>
                {cols.map((c) => {
                  const v = c.get(x);
                  const isBest = Math.abs(v - bestByCol[c.key]) < 1e-6;
                  return (
                    <StructuredListCell key={c.key} style={{ color: isBest ? TEAL : undefined, fontWeight: isBest ? 600 : 400 }}>
                      {c.fmt ? c.fmt(v) : v.toFixed(0)}
                    </StructuredListCell>
                  );
                })}
                <StructuredListCell>
                  {x.isCurrent ? (
                    <span style={{ color: TEXTD }}>—</span>
                  ) : (
                    <Button
                      size="sm"
                      kind="tertiary"
                      onClick={() => {
                        const m = loadScenario(x.name);
                        if (m) { api.reset(m); toast("Loaded “" + x.name + "”"); navigate("/"); }
                      }}
                    >
                      Load
                    </Button>
                  )}
                </StructuredListCell>
              </StructuredListRow>
            ))}
          </StructuredListBody>
        </StructuredListWrapper>
        <div style={{ fontSize: 10.5, color: TEXTD }}>Teal = best in column. Grades/KPIs are recomputed by the engine for each saved layout.</div>
      </div>
    </div>
  );
}

function PageHead() {
  return (
    <div className="page-head">
      <Button size="sm" kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate("/")}>Editor</Button>
      <h1 className="page-title">Compare scenarios</h1>
    </div>
  );
}
