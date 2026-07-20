import { useMemo } from "react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { costAnalysis } from "@flowplan/core/engine/cost";
import { cycleAnalysis } from "@flowplan/core/engine/cycle";
import { TEXTD, scoreColor } from "./colors";
import { money, num } from "../format";

// Always-on headline metrics. The point is that every edit — dragging a
// station, adding a lane, changing a cycle time — visibly moves cost per part.
// That single live number is what makes the layout feel consequential rather
// than decorative.
export function HeaderKpis({ api }: { api: FlowPlanApi }) {
  const { model, rating } = api;
  const cost = useMemo(() => costAnalysis(model), [model]);
  const cyc = useMemo(() => cycleAnalysis(model.stations, rating.balance.takt), [model.stations, rating.balance.takt]);

  if (model.stations.length === 0) return null;

  const kpi = (label: string, value: string, color?: string, title?: string) => (
    <div style={{ lineHeight: 1.15 }} title={title}>
      <div style={{ fontSize: "0.75rem", color: TEXTD, textTransform: "uppercase", letterSpacing: "0.32px" }}>{label}</div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: color ?? "var(--cds-text-primary)" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--cds-spacing-05)", marginLeft: "var(--cds-spacing-05)", flexWrap: "wrap" }}>
      {kpi("Grade", String(rating.letter), scoreColor(rating.composite), `Composite ${rating.composite.toFixed(1)}/100`)}
      {kpi("Output", num(rating.balance.lineOut) + "/sh", undefined, "Line output, constrained by the bottleneck")}
      {kpi(
        "Cost/part",
        cost.lineOut > 0 ? money(cost.currency, cost.costPerPart) : "—",
        undefined,
        "Opex per shift ÷ line output. The number to design against.",
      )}
      {kpi("Takt", rating.balance.takt > 0 ? rating.balance.takt + "s" : "—", undefined, "Seconds per part at the current line output")}
      {cyc.lineValueAddPct != null
        ? kpi("Value add", cyc.lineValueAddPct + "%", scoreColor(cyc.lineValueAddPct), "Share of decomposed cycle time that transforms the part")
        : null}
    </div>
  );
}
