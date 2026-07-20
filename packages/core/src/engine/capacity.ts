import type { Model, Station } from "../model/types";
import { DEFAULT_SHIFT_MODEL } from "../model/types";
import { effectiveCycleSec } from "./cycle";

// Capacity analysis (PAUL Capa MA + Capa HC). From multi-year demand and the
// shift model it derives, per machine and per year: how many machines are
// needed and at what utilization — and the head count per shift. Manual steps
// drive head count, machine/test steps drive machine capacity.

export interface MachineYear {
  year: number;
  units: number;
  machinesNeeded: number;
  utilizationPct: number;
}
export interface MachineCapacity {
  stationId: string;
  name: string;
  cycleSec: number;
  perYear: MachineYear[];
  peakMachines: number;
}
export interface CapacityAnalysis {
  hasDemand: boolean;
  years: number[];
  peakYear: number | null;
  /** Available productive seconds per year for one machine (after OEE). */
  availableSecPerYear: number;
  machines: MachineCapacity[];
  /** Operators at full manning, per shift, summed across process steps. */
  operatorsPerShift: number;
  /** Operators across all shifts (per-shift × shifts/day). */
  operatorsAllShifts: number;
}

function isMachineStep(s: Station): boolean {
  return s.role === "process" && (s.type === "machine" || s.type === "quality");
}

export function capacityAnalysis(model: Model): CapacityAnalysis {
  const sm = { ...DEFAULT_SHIFT_MODEL, ...(model.demand ?? {}) };
  const availableSecPerYear = Math.max(
    0,
    sm.workingDaysPerYear * sm.shiftsPerDay * sm.hoursPerShift * 3600 * sm.oee,
  );
  const years = model.demand?.years ?? [];

  const machines: MachineCapacity[] = model.stations.filter(isMachineStep).map((s) => {
    const cycle = effectiveCycleSec(s);
    const perYear: MachineYear[] = years.map((y) => {
      const secNeeded = y.units * cycle;
      const machinesNeeded = availableSecPerYear > 0 && secNeeded > 0 ? Math.max(1, Math.ceil(secNeeded / availableSecPerYear)) : 0;
      const utilizationPct = machinesNeeded > 0 ? Math.round((secNeeded / (machinesNeeded * availableSecPerYear)) * 100) : 0;
      return { year: y.year, units: y.units, machinesNeeded, utilizationPct };
    });
    return {
      stationId: s.id,
      name: s.name,
      cycleSec: cycle,
      perYear,
      peakMachines: perYear.reduce((a, p) => Math.max(a, p.machinesNeeded), 0),
    };
  });

  const peakYear = years.length ? years.reduce((a, b) => (b.units > a.units ? b : a)).year : null;
  const operatorsPerShift = model.stations.filter((s) => s.role === "process").reduce((a, s) => a + s.operators, 0);

  return {
    hasDemand: years.length > 0,
    years: years.map((y) => y.year),
    peakYear,
    availableSecPerYear,
    machines,
    operatorsPerShift,
    operatorsAllShifts: operatorsPerShift * sm.shiftsPerDay,
  };
}
