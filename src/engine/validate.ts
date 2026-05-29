import type { Flow, Station } from "../model/types";

export type Severity = "err" | "warn";

export interface ValidationIssue {
  sev: Severity;
  id: string | null;
  msg: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  valid: boolean;
}

// Process-flow validation: dead ends, orphans, unreachable steps, missing I/O.
// Branching/merging (fan-out / fan-in) is allowed — a process step may have
// several incoming or outgoing flows without being flagged. Ported from the demo.
export function validateFlow(stations: Station[], flows: Flow[]): ValidationResult {
  const byId: Record<string, Station> = {};
  stations.forEach((s) => {
    byId[s.id] = s;
  });
  const out: Record<string, number> = {};
  const inn: Record<string, number> = {};
  stations.forEach((s) => {
    out[s.id] = 0;
    inn[s.id] = 0;
  });
  flows.forEach((f) => {
    if (byId[f.from]) out[f.from]++;
    if (byId[f.to]) inn[f.to]++;
  });
  const issues: ValidationIssue[] = [];
  stations.forEach((s) => {
    if (s.role !== "output" && out[s.id] === 0)
      issues.push({ sev: "err", id: s.id, msg: `${s.name}: dead end — no outgoing flow (and not an output area).` });
    if (s.role !== "input" && inn[s.id] === 0)
      issues.push({ sev: "err", id: s.id, msg: `${s.name}: orphan — no incoming flow (and not an input area).` });
    if (s.role === "input" && inn[s.id] > 0)
      issues.push({ sev: "warn", id: s.id, msg: `${s.name}: input area has incoming flow — usually a source only.` });
    if (s.role === "output" && out[s.id] > 0)
      issues.push({ sev: "warn", id: s.id, msg: `${s.name}: output area has outgoing flow — usually a sink only.` });
  });
  const inputs = stations.filter((s) => s.role === "input").map((s) => s.id);
  const adj: Record<string, string[]> = {};
  stations.forEach((s) => {
    adj[s.id] = [];
  });
  flows.forEach((f) => {
    if (adj[f.from]) adj[f.from].push(f.to);
  });
  const seen: Record<string, boolean> = {};
  const stack = inputs.slice();
  while (stack.length) {
    const n = stack.pop() as string;
    if (seen[n]) continue;
    seen[n] = true;
    (adj[n] || []).forEach((m) => stack.push(m));
  }
  stations.forEach((s) => {
    if (s.role !== "input" && !seen[s.id])
      issues.push({ sev: "warn", id: s.id, msg: `${s.name}: not reachable from any input area.` });
  });
  if (inputs.length === 0)
    issues.push({ sev: "err", id: null, msg: "No input area defined — set a station's role to 'input'." });
  if (!stations.some((s) => s.role === "output"))
    issues.push({ sev: "err", id: null, msg: "No output area defined — set a station's role to 'output'." });
  return { issues, valid: issues.filter((i) => i.sev === "err").length === 0 };
}
