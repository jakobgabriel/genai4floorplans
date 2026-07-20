import type { Model } from "../model/types";
import { DEFAULT_SHIFT_HOURS, lossFactorOf } from "../model/types";
import { balanceAnalysis } from "./balance";
import { costAnalysis } from "./cost";
import { analyseWorkload } from "./workload";
import { archetypeCode } from "./archetype";
import { volumeSensitivity } from "./sensitivity";
import { openPoints } from "./openpoints";

// Cell data sheet (blueprint §11). Every cell gets this sheet, in identical
// form — that identity is what makes two cells comparable and lets a planner
// sort by whichever constraint actually binds. All fields are derived.

export interface CellDataSheet {
  archetype: string;
  productFamily: string;
  customerTaktSec: number;
  workContentWeightedSec: number | null;
  workContentRawSec: number | null;
  stationsChosen: number;
  stationsCalculated: number | null;
  operators: number;
  bottleneck: string | null;
  bottleneckOverTaktSec: number | null;
  behaviourAtPlus20: string;
  lineBalanceEfficiencyPct: number;
  changeoverBetweenVariantsSec: number;
  floorSpaceCell: number;
  floorSpaceMaterialSupply: number;
  floorSpaceUnit: string;
  openPoints: string[];
}

export function cellDataSheet(model: Model): CellDataSheet {
  const shiftHours = model.shiftHours ?? DEFAULT_SHIFT_HOURS;
  const bal = balanceAnalysis(model.stations, model.flows, shiftHours);
  const cost = costAnalysis(model, shiftHours);
  const process = model.stations.filter((s) => s.role === "process");
  const takt = bal.takt;

  const wl = model.workElements && model.workElements.length > 0
    ? analyseWorkload(model.workElements, model.variantModes, takt > 0 ? takt : undefined, lossFactorOf(model))
    : null;

  const arch = archetypeCode(model);
  const sens = volumeSensitivity(model, 0.2);

  const overTakt = bal.bottleneck && takt > 0 ? +(bal.bottleneck.cycle - takt).toFixed(1) : null;

  return {
    archetype: arch.code,
    productFamily: model.name,
    customerTaktSec: takt,
    workContentWeightedSec: wl ? wl.weightedTotalSec : +process.reduce((a, s) => a + s.cycleTimeSec, 0).toFixed(1),
    workContentRawSec: wl ? wl.worstTotalSec : null,
    stationsChosen: process.length,
    stationsCalculated: wl ? wl.stationsCalculated : null,
    operators: model.stations.reduce((a, s) => a + s.operators, 0),
    bottleneck: bal.bottleneck?.name ?? null,
    bottleneckOverTaktSec: overTakt,
    behaviourAtPlus20: sens.sentence,
    lineBalanceEfficiencyPct: bal.score,
    // Zero when a single model or all variants run in mix without changeover.
    changeoverBetweenVariantsSec: (model.variantModes?.length ?? 0) > 1 ? 0 : 0,
    floorSpaceCell: cost.floorSpace.cell,
    floorSpaceMaterialSupply: cost.floorSpace.materialSupply,
    floorSpaceUnit: cost.floorSpace.unit,
    openPoints: openPoints(model).map((p) => p.text),
  };
}
