import type { Model, Station } from "../model/types";
import { DEFAULT_COST_CONFIG, DEFAULT_MATERIAL_SUPPLY_FACTOR, DEFAULT_SHIFT_HOURS, isBlockingZone } from "../model/types";
import { computeKPIs } from "./kpis";
import { balanceAnalysis } from "./balance";
import { autoPotential } from "./automation";
import { stationCells } from "./geometry";

export interface AutomationROI {
  id: string;
  name: string;
  verdict: string;
  automationCapex: number;
  laborSavedPerYear: number;
  paybackMonths: number | null; // null = no labor to save / no capex set
}

/** Floor space reported as two separate figures (blueprint §4.9). The cell area
 *  is planned; the bin/replenishment area routinely is not, and one combined
 *  number understates the footprint by a third. Units are m² when
 *  costConfig.cellAreaM2 is set, otherwise grid cells (`unit`). */
export interface FloorSpace {
  /** Area occupied by the stations themselves. */
  cell: number;
  /** Extra area for material supply = cell × materialSupplyFactor. */
  materialSupply: number;
  /** Reserved space drawn on the canvas (spacer/aisle/esd zones). 0 when none. */
  reserved: number;
  /** cell + materialSupply + reserved — never shown alone, always with the split. */
  total: number;
  factor: number;
  unit: "m²" | "cells";
}

export interface CostResult {
  currency: string;
  capexTotal: number;
  laborPerShift: number;
  energyPerShift: number;
  transportPerShift: number;
  /** Floor-occupancy cost per shift = floor area × €/m²·yr ÷ annual shifts (C-08). */
  spacePerShift: number;
  /** Maintenance/MRO + tooling per shift = capex × pct/yr ÷ annual shifts (C-08). */
  maintenancePerShift: number;
  opexPerShift: number;
  costPerPart: number;
  /** Labour-dependent cost per part (PAUL LDC) — operator time. */
  ldcPerPart: number;
  /** Machine-dependent cost per part (PAUL MDC) — energy + transport. */
  mdcPerPart: number;
  lineOut: number;
  floorSpace: FloorSpace;
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

  // Floor space, split cell vs material supply (blueprint §4.9). Cell area is the
  // footprint the stations occupy; material supply is the routinely-forgotten
  // bins/replenishment area on top of it.
  const cellUnits = model.stations.reduce((a, s) => a + stationCells(s).length, 0);
  const cellArea = cfg.cellAreaM2 && cfg.cellAreaM2 > 0 ? cfg.cellAreaM2 : 1;
  const factor = cfg.materialSupplyFactor ?? DEFAULT_MATERIAL_SUPPLY_FACTOR;
  const cell = +(cellUnits * cellArea).toFixed(2);
  const materialSupply = +(cell * factor).toFixed(2);
  // Reserved space explicitly drawn on the canvas: spacer/aisle/esd zones (not
  // blocking obstacles, which represent columns/walls the cell must design around).
  const reservedUnits = (model.noGoZones ?? [])
    .filter((z) => !isBlockingZone(z))
    .reduce((a, z) => a + z.w * z.h, 0);
  const reserved = +(reservedUnits * cellArea).toFixed(2);
  const floorSpace: FloorSpace = {
    cell,
    materialSupply,
    reserved,
    total: +(cell + materialSupply + reserved).toFixed(2),
    factor,
    unit: cfg.cellAreaM2 && cfg.cellAreaM2 > 0 ? "m²" : "cells",
  };

  // Floor space and maintenance/tooling finally enter opex (audit C-08): space
  // was measured but never charged, and equipment carried no upkeep cost.
  const annualShifts = cfg.annualShifts > 0 ? cfg.annualShifts : 1;
  const spaceCostPerM2Year = cfg.spaceCostPerM2Year ?? 0;
  const maintenancePct = cfg.maintenancePctOfCapexPerYear ?? 0;
  const spacePerShift = +((floorSpace.total * spaceCostPerM2Year) / annualShifts).toFixed(2);
  const maintenancePerShift = +((capexTotal * maintenancePct) / annualShifts).toFixed(2);

  const opexPerShift = +(laborPerShift + energyPerShift + transportPerShift + spacePerShift + maintenancePerShift).toFixed(2);

  const lineOut = balanceAnalysis(model.stations, model.flows, shiftHours).lineOut;
  const costPerPart = lineOut > 0 ? +(opexPerShift / lineOut).toFixed(3) : 0;
  // LDC/MDC split (PAUL): labour-dependent vs everything-else per part. Space and
  // maintenance are machine/facility-dependent, so they sit in MDC.
  const ldcPerPart = lineOut > 0 ? +(laborPerShift / lineOut).toFixed(3) : 0;
  const mdcPerPart = lineOut > 0 ? +((energyPerShift + transportPerShift + spacePerShift + maintenancePerShift) / lineOut).toFixed(3) : 0;

  const automation: AutomationROI[] = model.stations
    .filter((s) => s.role === "process")
    .map((s) => {
      const ap = autoPotential(s);
      // Automating removes the step's operator labour, but the new equipment
      // carries its own annual upkeep (audit C-08) — net it out so payback is
      // not overstated. (Assumes full operator removal; a partial-manning model
      // would refine this.)
      const laborSavedPerYear = s.operators * stationHours(s) * cfg.laborCostPerHour * annualShifts;
      const capex = s.automationCapex ?? 0;
      const addedUpkeepPerYear = capex * maintenancePct;
      const netSavedPerYear = laborSavedPerYear - addedUpkeepPerYear;
      const paybackMonths = capex > 0 && netSavedPerYear > 0 ? +((capex / netSavedPerYear) * 12).toFixed(1) : null;
      return { id: s.id, name: s.name, verdict: ap.verdict, automationCapex: capex, laborSavedPerYear: Math.round(laborSavedPerYear), paybackMonths };
    });

  return { currency: cfg.currency, capexTotal, laborPerShift: +laborPerShift.toFixed(2), energyPerShift: +energyPerShift.toFixed(2), transportPerShift, spacePerShift, maintenancePerShift, opexPerShift, costPerPart, ldcPerPart, mdcPerPart, lineOut, floorSpace, automation };
}
