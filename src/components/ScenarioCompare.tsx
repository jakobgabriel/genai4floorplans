import { useMemo } from "react";
import type { Model } from "../model/types";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { buildRating } from "../engine/rating";
import { listScenarios, loadScenario } from "../store/scenarios";
import { useToast } from "./ui";
import { scoreColor, TEAL, TEXTD } from "./colors";

interface Row {
  name: string;
  model: Model | null;
  isCurrent: boolean;
}

// Side-by-side KPI/grade comparison across the current model and all saved
// scenarios, with best-in-column highlighting.
export function ScenarioCompare({ api, onClose }: { api: FlowPlanApi; onClose: () => void }) {
  const { toast } = useToast();
  const rows = useMemo<Row[]>(() => {
    const saved = listScenarios().map((s) => ({ name: s.name, model: loadScenario(s.name), isCurrent: false }));
    return [{ name: api.model.name + " (current)", model: api.model, isCurrent: true }, ...saved];
  }, [api.model]);

  const rated = rows
    .filter((r) => r.model)
    .map((r) => ({ ...r, rating: buildRating(r.model as Model) }));

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

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Compare scenarios</h2>
          <button className="btn sm" onClick={onClose}>
            ✕
          </button>
        </div>
        {rated.length <= 1 ? (
          <p>Save a few variants (Flow ▸ Scenarios) to compare them here side by side.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="schemaTbl" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Grade</th>
                  {cols.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rated.map((x) => (
                  <tr key={x.name}>
                    <td style={{ color: x.isCurrent ? TEAL : undefined }}>{x.name}</td>
                    <td style={{ color: scoreColor(x.rating.composite), fontWeight: 600 }}>{x.rating.letter}</td>
                    {cols.map((c) => {
                      const v = c.get(x);
                      const best = Math.abs(v - bestByCol[c.key]) < 1e-6;
                      return (
                        <td key={c.key} style={{ color: best ? TEAL : undefined, fontWeight: best ? 600 : 400 }}>
                          {c.fmt ? c.fmt(v) : v.toFixed(0)}
                        </td>
                      );
                    })}
                    <td>
                      {x.isCurrent ? (
                        <span style={{ color: TEXTD }}>—</span>
                      ) : (
                        <button
                          className="btn sm"
                          onClick={() => {
                            const m = loadScenario(x.name);
                            if (m) {
                              api.reset(m);
                              toast("Loaded “" + x.name + "”");
                              onClose();
                            }
                          }}
                        >
                          Load
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 10.5, color: TEXTD }}>Teal = best in column. Grades/KPIs are recomputed by the engine for each saved layout.</div>
          </div>
        )}
      </div>
    </div>
  );
}
