import type { Model } from "../model/types";
import { buildRating } from "../engine/rating";
import { autoPotential } from "../engine/automation";
import { triggerDownload } from "./json";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(rows: Array<Array<string | number>>): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

// CSV export of the KPI + automation-potential tables for review packs (spec v1.2).
export function buildKpiCsv(model: Model): string {
  const r = buildRating(model);
  const rows: Array<Array<string | number>> = [["KPI", "Score (0-100)"]];
  rows.push(["Material flow cost", r.scores.flowCost.toFixed(1)]);
  rows.push(["Travel effort", r.scores.travel.toFixed(1)]);
  rows.push(["Aisle congestion", r.scores.congestion.toFixed(1)]);
  rows.push(["Placement efficiency", r.scores.placement.toFixed(1)]);
  rows.push(["Line balance", r.scores.balance.toFixed(1)]);
  rows.push(["Ergonomics", r.scores.ergo.toFixed(1)]);
  rows.push(["Automation coherence", r.scores.auto.toFixed(1)]);
  rows.push(["Composite", r.composite.toFixed(1)]);
  rows.push(["Letter grade", r.letter]);
  rows.push([]);
  rows.push(["Station", "Automation verdict", "Potential (0-100)", "Current state", "Source"]);
  model.stations
    .filter((s) => s.role === "process")
    .forEach((s) => {
      const ap = autoPotential(s);
      rows.push([s.name, ap.verdict, ap.pct.toFixed(0), s.auto, ap.src]);
    });
  return toCSV(rows);
}

export function downloadKpiCsv(model: Model): void {
  const blob = new Blob([buildKpiCsv(model)], { type: "text/csv" });
  triggerDownload(blob, (model.name || "layout").replace(/\s+/g, "_") + "_kpis.csv");
}
