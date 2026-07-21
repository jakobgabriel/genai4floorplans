import type { Model } from "@flowplan/core/model/types";
import { buildRating } from "@flowplan/core/engine/rating";
import { autoPotential } from "@flowplan/core/engine/automation";
import { serializeLayout } from "./image";

// One-page printable review report: grade, KPI bars, bottleneck, Pareto,
// automation summary, and the layout image. Opens in a new window and prints.

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function bar(label: string, score: number): string {
  const col = score >= 80 ? "#2bb6a8" : score >= 60 ? "#e0a458" : "#d96b5b";
  return `<div class="kpi"><div class="kpitop"><span>${esc(label)}</span><b style="color:${col}">${score.toFixed(0)}</b></div>
    <div class="track"><div style="width:${score}%;background:${col}"></div></div></div>`;
}

export function buildReportHTML(model: Model, layoutSvg: string): string {
  const r = buildRating(model);
  const bn = r.balance.bottleneck;
  const letterCol = r.composite >= 80 ? "#2bb6a8" : r.composite >= 60 ? "#e0a458" : "#d96b5b";
  const pareto = r.pareto
    .slice(0, 5)
    .map((p) => `<tr><td>${esc(p.from)} → ${esc(p.to)}</td><td>${p.share.toFixed(0)}%</td></tr>`)
    .join("");
  const auto = model.stations
    .filter((s) => s.role === "process")
    .map((s) => {
      const ap = autoPotential(s);
      return `<tr><td>${esc(s.name)}</td><td>${ap.verdict}</td><td>${ap.pct.toFixed(0)}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>FlowPlan report — ${esc(model.name)}</title>
  <style>
    body{font-family:system-ui,Arial,sans-serif;color:#1a2326;margin:24px;max-width:900px}
    h1{font-size:20px;margin:0 0 2px} .sub{color:#667;margin:0 0 16px;font-size:13px}
    .grid{display:flex;gap:24px;flex-wrap:wrap}
    .col{flex:1;min-width:280px}
    .grade{display:inline-flex;align-items:center;gap:14px;margin-bottom:12px}
    .gbox{width:54px;height:54px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;border:2px solid ${letterCol};color:${letterCol}}
    .kpi{margin-bottom:8px} .kpitop{display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px}
    .track{height:6px;background:#e7eced;border-radius:3px;overflow:hidden} .track>div{height:100%}
    table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0 14px}
    td,th{border-bottom:1px solid #e7eced;padding:4px 6px;text-align:left}
    .callout{background:#fbf1e6;border-left:3px solid #e0a458;padding:8px 10px;border-radius:4px;font-size:12px;margin:8px 0}
    svg{max-width:100%;height:auto;border:1px solid #dde;border-radius:8px}
    @media print{body{margin:0}.noprint{display:none}}
    .btn{padding:8px 14px;border:1px solid #ccc;border-radius:6px;background:#f5f7f7;cursor:pointer}
  </style></head><body>
  <button class="btn noprint" onclick="window.print()" style="float:right">Print / Save PDF</button>
  <h1>FlowPlan layout report</h1>
  <p class="sub">${esc(model.name)} · grid ${model.gridW}×${model.gridH} · ${model.stations.length} stations</p>
  <div class="grid">
    <div class="col">
      <div class="grade"><div class="gbox">${r.letter}</div><div><div style="font-size:11px;color:#667">ACTUAL-STATE RATING</div><div style="font-size:24px;font-weight:600">${r.composite.toFixed(0)}<span style="font-size:13px;color:#889">/100</span></div></div></div>
      ${bar("Material flow cost", r.scores.flowCost)}
      ${bar("Travel effort", r.scores.travel)}
      ${bar("Aisle congestion", r.scores.congestion)}
      ${bar("Placement efficiency", r.scores.placement)}
      ${bar("Line balance", r.scores.balance)}
      ${bar("Ergonomics", r.scores.ergo)}
      ${bar("Automation coherence", r.scores.auto)}
      <div class="callout">Improvement potential: −${r.flowReductionPct.toFixed(0)}% material-flow cost by repositioning movable stations.</div>
      ${bn ? `<div class="callout">Bottleneck: ${esc(bn.name)} at ${bn.cycle}s/part caps the line at ${r.balance.lineOut.toLocaleString()} parts/shift (line pace ≈ ${r.balance.lineCycleSec}s/part${r.balance.takt > 0 ? `, customer takt ${r.balance.takt}s` : ""}).</div>` : ""}
    </div>
    <div class="col">
      ${layoutSvg}
      <h3 style="font-size:13px;margin:14px 0 4px">Where the cost sits</h3>
      <table><tr><th>Flow</th><th>Share</th></tr>${pareto}</table>
      <h3 style="font-size:13px;margin:0 0 4px">Automation potential</h3>
      <table><tr><th>Step</th><th>Verdict</th><th>Score</th></tr>${auto}</table>
    </div>
  </div>
  </body></html>`;
}

export function openReport(model: Model): void {
  const layout = serializeLayout("ACTUAL") || serializeLayout("IMPROVED");
  const html = buildReportHTML(model, layout?.svg ?? "");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
