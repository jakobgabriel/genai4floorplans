import {
  StructuredListWrapper,
  StructuredListBody,
  StructuredListRow,
  StructuredListCell,
} from "@carbon/react";
import type { ProcessCatalogEntry } from "@flowplan/core/model/catalog";
import type { Station } from "@flowplan/core/model/types";
import { effectiveCycleSec, isDecomposed } from "@flowplan/core/engine/cycle";
import { sumCycle } from "@flowplan/core/model/types";
import { TEXTD } from "./colors";

// Element documentation — every field of an element's data model, laid out as a
// readable Carbon StructuredList. Drives two surfaces: a library entry
// (ProcessCatalogEntry) and a placed station (Station). This is the "read
// everything about this block" view; it is deliberately read-only.

interface Section {
  title: string;
  rows: Array<[string, string | number | undefined | null]>;
}

function Doc({ sections, title, subtitle }: { sections: Section[]; title: string; subtitle?: string }) {
  return (
    <div className="element-doc">
      <div className="element-doc__head">
        <div className="element-doc__title">{title}</div>
        {subtitle ? <div className="element-doc__sub">{subtitle}</div> : null}
      </div>
      {sections.map((sec) => {
        const rows = sec.rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
        if (rows.length === 0) return null;
        return (
          <div key={sec.title} className="element-doc__section">
            <div className="lab" style={{ marginBottom: 4 }}>{sec.title}</div>
            <StructuredListWrapper isCondensed aria-label={sec.title}>
              <StructuredListBody>
                {rows.map(([k, v]) => (
                  <StructuredListRow key={k}>
                    <StructuredListCell style={{ color: TEXTD, width: "50%" }}>{k}</StructuredListCell>
                    <StructuredListCell>{String(v)}</StructuredListCell>
                  </StructuredListRow>
                ))}
              </StructuredListBody>
            </StructuredListWrapper>
          </div>
        );
      })}
    </div>
  );
}

/** Documentation for a library catalog entry. */
export function CatalogEntryDoc({ entry, provenance }: { entry: ProcessCatalogEntry; provenance?: "builtin" | "custom" }) {
  const area = entry.w != null && entry.h != null ? `${entry.w} × ${entry.h} cells (${entry.w * entry.h})` : undefined;
  const sections: Section[] = [
    {
      title: "Identity",
      rows: [
        ["Name", entry.name],
        ["Category", entry.category],
        ["Station type", entry.stationType],
        ["Capability (N:M)", entry.capability],
        ["Process id", entry.processId],
        ["Source", provenance === "custom" ? "custom (user-authored)" : "built-in (seed)"],
      ],
    },
    {
      title: "Time & quality",
      rows: [
        ["Cycle time", `${entry.cycleTimeSec}s`],
        ["Data quality", entry.dataQuality],
        ["Changeover / setup", entry.setupMin != null ? `${entry.setupMin} min` : undefined],
        ["Attended fraction", entry.attendedFraction != null ? entry.attendedFraction.toFixed(2) : undefined],
        ["Robustness", entry.robustness],
      ],
    },
    {
      title: "Footprint",
      rows: [["Bounding box", area]],
    },
    {
      title: "Cost",
      rows: [
        ["Tooling cost", entry.toolingCost != null ? entry.toolingCost.toLocaleString() : undefined],
        ["Machine investment", entry.machineInvest != null ? entry.machineInvest.toLocaleString() : undefined],
      ],
    },
    {
      title: "Notes",
      rows: [["", entry.notes]],
    },
  ];
  return <Doc sections={sections} title={entry.name} subtitle={`${entry.category} · ${entry.stationType}`} />;
}

/** Documentation for a placed station (the node on the canvas). */
export function StationDoc({ station }: { station: Station }) {
  const s = station;
  const decomposed = isDecomposed(s);
  const total = effectiveCycleSec(s);
  const cycleRow: [string, string] = decomposed
    ? ["Cycle time", `${total.toFixed(1)}s (value-add ${(s.cycle!.valueAddSec).toFixed(1)}s of ${sumCycle(s.cycle!).toFixed(1)}s)`]
    : ["Cycle time", `${total.toFixed(1)}s (opaque)`];
  const sections: Section[] = [
    {
      title: "Identity",
      rows: [
        ["Name", s.name],
        ["Role", s.role],
        ["Station type", s.type],
        ["Provides", s.provides && s.provides.length ? s.provides.join(", ") : undefined],
        ["Pinned", s.fixed ? "yes" : undefined],
      ],
    },
    {
      title: "Time & work",
      rows: [
        cycleRow,
        ["Changeover", s.changeoverMin ? `${s.changeoverMin} min` : undefined],
        ["Operators", s.operators],
        ["Parallel units", s.parallelUnits && s.parallelUnits > 1 ? s.parallelUnits : undefined],
        ["Scrap rate", s.scrapRate ? `${Math.round(s.scrapRate * 100)}%` : undefined],
      ],
    },
    {
      title: "Capacity & energy",
      rows: [
        ["Capacity / shift", s.capacityPerShift ? s.capacityPerShift.toLocaleString() : undefined],
        ["Energy draw", s.energyKw ? `${s.energyKw} kW` : undefined],
        ["Automation", s.auto],
        ["Ergonomic risk", s.ergoRisk],
      ],
    },
    {
      title: "Footprint",
      rows: [
        ["Bounding box", `${s.w} × ${s.h} cells (${s.w * s.h})`],
        ["Position", `(${s.x}, ${s.y})`],
      ],
    },
    {
      title: "Cost",
      rows: [
        ["Equipment capex", s.capex ? s.capex.toLocaleString() : undefined],
        ["Automation capex", s.automationCapex ? s.automationCapex.toLocaleString() : undefined],
      ],
    },
    {
      title: "Notes",
      rows: [["", s.notes]],
    },
  ];
  return <Doc sections={sections} title={s.name} subtitle={`${s.role} · ${s.type}`} />;
}
