import type { Model } from "../model/types";
import { DEFAULT_SHIFT_MODEL } from "../model/types";

/** The governing demand for takt: the peak year drives the tightest takt, so a
 *  cell sized to it meets every year in the horizon. Returns 0 when no demand
 *  is modelled. */
export function governingDemandUnits(model: Pick<Model, "demand">): number {
  const years = model.demand?.years ?? [];
  return years.length ? Math.max(...years.map((y) => y.units)) : 0;
}

/** Customer takt in seconds/part = net available production time ÷ demand
 *  (audit A-01, spec §9 "takt is the master constraint").
 *
 *  Available time is the NET operating time from the shift model. Classical takt
 *  deliberately excludes OEE: performance/availability losses are absorbed by
 *  requiring the station cycle to sit *below* takt with margin, and OEE is
 *  applied where it belongs — machine-count sizing in `capacity.ts`. Baking OEE
 *  into takt would double-count the loss.
 *
 *  Returns 0 when demand is unknown — an honest "no takt yet" rather than a
 *  fabricated number derived from the line's own output. */
export function customerTaktSec(model: Pick<Model, "demand">): number {
  const units = governingDemandUnits(model);
  if (units <= 0) return 0;
  const sm = { ...DEFAULT_SHIFT_MODEL, ...(model.demand ?? {}) };
  const availableSecPerYear = sm.workingDaysPerYear * sm.shiftsPerDay * sm.hoursPerShift * 3600;
  return availableSecPerYear > 0 ? +(availableSecPerYear / units).toFixed(2) : 0;
}
