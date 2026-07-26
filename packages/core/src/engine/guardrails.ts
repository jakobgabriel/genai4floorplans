import type { Model, Flow, Station } from "../model/types";
import { center } from "./geometry";

// Guardrail contract (blueprint §10). The four material paths — IN / OUT(FIFO) /
// NOK / RWK — are what a cell guarantees at its edges, and the *separation* is
// the guardrail: a reject must not be able to leave on the good-part route,
// ensured by geometry rather than by a work instruction. These checks are
// design-testable, so a violation renders on the offending geometry (Law 3),
// never as a blocking dialog.

export type GuardrailSeverity = "error" | "warn" | "info";

export interface GuardrailFinding {
  id: string;
  severity: GuardrailSeverity;
  stationId?: string;
  message: string;
}

const kindOf = (f: Flow): string => f.kind ?? "good";

/** Unit direction from station a's centre to b's centre. */
function dir(a: Station, b: Station): { x: number; y: number } {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export function guardrailCheck(model: Model): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];
  const byId: Record<string, Station> = {};
  model.stations.forEach((s) => (byId[s.id] = s));

  const hasReject = model.flows.some((f) => kindOf(f) === "nok" || kindOf(f) === "rwk");

  // 1) Good/reject spatial separation — the headline guardrail. For any station
  //    emitting both a good and a reject flow, the two must leave in clearly
  //    different directions, or a mix-up is spatially possible.
  for (const s of model.stations) {
    const out = model.flows.filter((f) => f.from === s.id);
    const good = out.filter((f) => kindOf(f) === "good");
    const rejects = out.filter((f) => kindOf(f) === "nok" || kindOf(f) === "rwk");
    if (good.length === 0 || rejects.length === 0) continue;
    for (const g of good) {
      const gt = byId[g.to];
      if (!gt) continue;
      const gd = dir(s, gt);
      for (const r of rejects) {
        const rt = byId[r.to];
        if (!rt) continue;
        const rd = dir(s, rt);
        const cos = gd.x * rd.x + gd.y * rd.y; // 1 = same direction
        if (cos > 0.7) {
          findings.push({
            id: `sep:${s.id}:${r.to}`,
            severity: "error",
            stationId: s.id,
            message: `${s.name}: the ${kindOf(r).toUpperCase()} path leaves in the same direction as the good part — a reject can escape on the good route. Route them to different sides.`,
          });
        }
      }
    }
  }

  // 2) Good only after test — a good-part outfeed should be fed through a quality
  //    step. If reject paths are modelled but no quality station exists, the
  //    "good only after test" contract can't hold.
  const outputs = model.stations.filter((s) => s.role === "output");
  const hasQuality = model.stations.some((s) => s.type === "quality");
  if (hasReject && outputs.length > 0 && !hasQuality) {
    findings.push({
      id: "contract:test",
      severity: "warn",
      message: "A part counts as good only after passing a test, but the cell has no quality station before its good-part outfeed.",
    });
  }

  // 3) Rework must re-test — a RWK flow should return to (or ahead of) a quality
  //    station, so reworked parts pass the test again without exception.
  for (const f of model.flows) {
    if (kindOf(f) !== "rwk") continue;
    const target = byId[f.to];
    if (target && target.type !== "quality" && target.role !== "process") {
      findings.push({
        id: `rwk:${f.from}:${f.to}`,
        severity: "warn",
        stationId: f.to,
        message: `Rework returns to ${target.name}, which is not a process/quality step — reworked parts must re-enter where the test runs again.`,
      });
    }
  }

  return findings;
}
