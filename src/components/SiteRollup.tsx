import { useMemo } from "react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { buildRating } from "../engine/rating";
import { costAnalysis } from "../engine/cost";
import { scoreColor, TEAL, TEXTD } from "./colors";

// Site-level rollup across all cells in the workspace. Each cell is scored
// independently by the engine; inter-cell flow is out of scope.
export function SiteRollup({ api, onClose }: { api: FlowPlanApi; onClose: () => void }) {
  const rows = useMemo(() => {
    return api.snapshotCells().map((c) => {
      const r = buildRating(c.model);
      const cost = costAnalysis(c.model);
      return { id: c.id, name: c.name, letter: r.letter, composite: r.composite, lineOut: r.balance.lineOut, costPerPart: cost.costPerPart, currency: cost.currency };
    });
  }, [api]);

  const totalThroughput = rows.reduce((a, r) => a + r.lineOut, 0);
  const avgGrade = rows.length ? rows.reduce((a, r) => a + r.composite, 0) / rows.length : 0;
  const cur = rows[0]?.currency ?? "$";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Site rollup</h2>
          <button className="btn sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ display: "flex", gap: 18, margin: "6px 0 12px" }}>
          <div>
            <div className="lab">Cells</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{rows.length}</div>
          </div>
          <div>
            <div className="lab">Total throughput</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: TEAL }}>{totalThroughput.toLocaleString()}<span style={{ fontSize: 11, color: TEXTD }}> /shift</span></div>
          </div>
          <div>
            <div className="lab">Avg grade</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: scoreColor(avgGrade) }}>{avgGrade.toFixed(0)}</div>
          </div>
        </div>
        <table className="schemaTbl">
          <thead>
            <tr>
              <th>Cell</th>
              <th>Grade</th>
              <th>Score</th>
              <th>Parts/shift</th>
              <th>Cost/part</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ color: r.id === api.activeId ? TEAL : undefined }}>{r.name}</td>
                <td style={{ color: scoreColor(r.composite), fontWeight: 600 }}>{r.letter}</td>
                <td>{r.composite.toFixed(0)}</td>
                <td>{r.lineOut.toLocaleString()}</td>
                <td>
                  {cur}
                  {r.costPerPart.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td>
                  {r.id === api.activeId ? (
                    <span style={{ color: TEXTD }}>active</span>
                  ) : (
                    <button className="btn sm" onClick={() => { api.switchCell(r.id); onClose(); }}>
                      Open
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 10.5, color: TEXTD }}>Each cell is rated independently by the engine. Inter-cell material flow isn't modeled.</div>
      </div>
    </div>
  );
}
