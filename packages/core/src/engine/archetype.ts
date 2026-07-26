import type { Model } from "../model/types";
import { DEFAULT_COST_CONFIG } from "../model/types";
import { center } from "./geometry";
import { topoOrder } from "./dag";
import { classifyFreedom } from "./freedom";

// Archetype code (blueprint §02). `MA · [flow shape] · [stations] · [sequence] ·
// [labour class]`, e.g. MA-U-05-F-H. It tells a planner whether a variant fits
// *before* opening it. Derived, not authored.

export type FlowShape = "I" | "L" | "U" | "S" | "N" | "E";

export interface Archetype {
  code: string;
  flowShape: FlowShape;
  stations: number;
  sequence: "F" | "V"; // technologically fixed vs variable
  labour: "H" | "N"; // high vs low wage
}

/** Flow shape from the geometry of the process chain: count the turns along the
 *  material path (0 → I line, 1 → L, 2 with return → U, more → S). A single
 *  process step is E; a pure test/nest cluster is N. */
function flowShapeOf(model: Model): FlowShape {
  const process = model.stations.filter((s) => s.role === "process");
  if (process.length <= 1) return "E";
  const order = topoOrder(model.stations, model.flows).filter((id) => process.some((s) => s.id === id));
  const pts = order.map((id) => center(model.stations.find((s) => s.id === id)!));
  if (pts.length < 3) return "I";
  let turns = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    // Cross product of the two segment directions; a nonzero-ish value is a turn.
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 0.5) turns++;
  }
  if (turns === 0) return "I";
  if (turns === 1) return "L";
  // A U returns near its start; otherwise the repeated turns read as a serpentine S.
  const start = pts[0];
  const end = pts[pts.length - 1];
  const span = Math.max(model.gridW, model.gridH);
  const returns = Math.hypot(end.x - start.x, end.y - start.y) < span * 0.4;
  if (turns === 2 && returns) return "U";
  return "S";
}

/** Whether the sequence is technologically fixed: most precedence edges are
 *  compulsory. Without a workload the routing order is treated as variable. */
function sequenceOf(model: Model): "F" | "V" {
  const els = model.workElements ?? [];
  if (els.length === 0) return "V";
  const fr = classifyFreedom(els, model.variantModes);
  const total = fr.elements.length || 1;
  return fr.counts.compulsory / total >= 0.5 ? "F" : "V";
}

/** Labour class from the cell's labour tariff. */
function labourOf(model: Model): "H" | "N" {
  const rate = model.costConfig?.laborCostPerHour ?? DEFAULT_COST_CONFIG.laborCostPerHour;
  return rate >= 25 ? "H" : "N";
}

export function archetypeCode(model: Model): Archetype {
  const flowShape = flowShapeOf(model);
  const stations = model.stations.filter((s) => s.role === "process").length;
  const sequence = sequenceOf(model);
  const labour = labourOf(model);
  const code = `MA-${flowShape}-${String(stations).padStart(2, "0")}-${sequence}-${labour}`;
  return { code, flowShape, stations, sequence, labour };
}
