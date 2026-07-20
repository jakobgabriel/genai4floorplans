import type { Model } from "../model/types";
import { DEFAULT_SHIFT_HOURS } from "../model/types";
import { balanceAnalysis } from "./balance";

// Behaviour at +N % volume (blueprint §11 data sheet). Volume is the assumption
// that breaks most often, so the sheet states it explicitly, as a sentence.
// Higher volume means a shorter takt; stations whose cycle no longer fits it
// become the new constraint.

export interface VolumeSensitivity {
  pct: number;
  currentTakt: number;
  newTakt: number;
  exceeding: { id: string; name: string; cycle: number; overBy: number }[];
  stationsNow: number;
  stationsNeeded: number;
  sentence: string;
}

export function volumeSensitivity(model: Model, pct = 0.2): VolumeSensitivity {
  const shiftHours = model.shiftHours ?? DEFAULT_SHIFT_HOURS;
  const bal = balanceAnalysis(model.stations, model.flows, shiftHours);
  const currentTakt = bal.takt;
  const newTakt = currentTakt > 0 ? +(currentTakt / (1 + pct)).toFixed(1) : 0;

  const steps = bal.steps;
  const exceeding = steps
    .filter((s) => s.cycle > newTakt && newTakt > 0)
    .map((s) => ({ id: s.id, name: s.name, cycle: s.cycle, overBy: +(s.cycle - newTakt).toFixed(1) }))
    .sort((a, b) => b.overBy - a.overBy);

  const stationsNow = steps.length;
  const totalCycle = steps.reduce((a, s) => a + s.cycle, 0);
  const stationsNeeded = newTakt > 0 ? Math.max(stationsNow, Math.ceil(totalCycle / newTakt)) : stationsNow;

  const pctLabel = Math.round(pct * 100);
  let sentence: string;
  if (currentTakt <= 0) {
    sentence = "No takt yet — set demand to see the volume response.";
  } else if (exceeding.length === 0) {
    sentence = `At +${pctLabel}% volume takt drops to ${newTakt.toFixed(1)} s and every station still fits — the headroom absorbs the increase.`;
  } else {
    const names = exceeding.map((e) => e.name).join(exceeding.length === 2 ? " and " : ", ");
    const verb = exceeding.length === 1 ? "exceeds" : "exceed";
    const extra = stationsNeeded > stationsNow ? ` — the binding step must be split → ${stationsNeeded} stations` : " — rebalance to hold takt";
    sentence = `Takt drops to ${newTakt.toFixed(1)} s → ${names} ${verb} takt${extra}.`;
  }

  return { pct, currentTakt, newTakt, exceeding, stationsNow, stationsNeeded, sentence };
}
