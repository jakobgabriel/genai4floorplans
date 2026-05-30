import type { Model, Station } from "../model/types";
import { DEFAULT_COST_CONFIG, DEFAULT_SHIFT_HOURS } from "../model/types";
import { computeKPIs } from "./kpis";
import { balanceAnalysis } from "./balance";
import { autoPotential } from "./automation";

export interface AutomationROI {
  id: string;
  name: string;
  verdict: string;
  automationCapex: number;
  laborSavedPerYear: number;
  paybackMonths: number | null; // null = no labor to save / no capex set
}

export interface CostResult {
  currency: string;
  capexTotal: number;
  laborPerShift: number;
  energyPerShift: number;
  transportPerShift: number;
  opexPerShift: number;
  costPerPart: number;
  lineOut: number;
  automation: AutomationROI[];
}

// Informational cost / ROI model. Reuses computeKPIs (flow cost as a transport
// proxy) and balanceAnalysis (line output). Not part of the composite rating, so
// adding cost fields never moves the golden numbers.
export function costAnalysis(model: Model, shiftHours: number = model.shiftHours ?? DEFAULT_SHIFT_HOURS): CostResult {
  const cfg = { ...DEFAULT_COST_CONFIG, ...(model.costConfig ?? {}) };
  const grid = { gridW: model.gridW, gridH: model.gridH, noGoZones: model.noGoZones };

  const capexTotal = model.stations.reduce((a, s) => a + (s.capex ?? 0), 0);

  const stationHours = (s: Station) => s.shiftHours ?? shiftHours;
  const laborPerShift = model.stations.reduce((a, s) => a + s.operators * stationHours(s) * cfg.laborCostPerHour, 0);
  const energyPerShift = model.stations.reduce((a, s) => a + (s.energyKw ?? 0) * stationHours(s) * cfg.energyCostPerKwh, 0);
  const transportPerShift = +computeKPIs(model.stations, model.flows, grid).flowCost.toFixed(2);
  const opexPerShift = +(laborPerShift + energyPerShift + transportPerShift).toFixed(2);

  const lineOut = balanceAnalysis(model.stations, model.flows, shiftHours).lineOut;
  const costPerPart = lineOut > 0 ? +(opexPerShift / lineOut).toFixed(3) : 0;

  const automation: AutomationROI[] = model.stations
    .filter((s) => s.role === "process")
    .map((s) => {
      const ap = autoPotential(s);
      // assume automating removes the step's operators' labor
      const laborSavedPerYear = s.operators * stationHours(s) * cfg.laborCostPerHour * cfg.annualShifts;
      const capex = s.automationCapex ?? 0;
      const paybackMonths = capex > 0 && laborSavedPerYear > 0 ? +((capex / laborSavedPerYear) * 12).toFixed(1) : null;
      return { id: s.id, name: s.name, verdict: ap.verdict, automationCapex: capex, laborSavedPerYear: Math.round(laborSavedPerYear), paybackMonths };
    });

  return { currency: cfg.currency, capexTotal, laborPerShift: +laborPerShift.toFixed(2), energyPerShift: +energyPerShift.toFixed(2), transportPerShift, opexPerShift, costPerPart, lineOut, automation };
}
