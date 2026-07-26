import { useMemo } from "react";
import type { PanelProps } from "./panels";
import { cellDataSheet } from "@flowplan/core/engine/datasheet";
import { StructuredListBody, StructuredListCell, StructuredListRow, StructuredListWrapper, Tag } from "@carbon/react";
import { AMBER, RED, TEXT, TEXTD } from "./colors";

// The cell data sheet (blueprint §11) — the identical-form artifact every
// variant gets, so two cells are comparable and a planner can sort by whichever
// constraint binds. Every figure is derived; nothing is typed here.
export function DataSheetPanel({ api }: PanelProps) {
  const d = useMemo(() => cellDataSheet(api.model), [api.model]);

  const row = (label: string, value: React.ReactNode, hint?: string) => (
    <StructuredListRow>
      <StructuredListCell style={{ color: TEXTD, whiteSpace: "nowrap", verticalAlign: "top", width: "40%" }}>{label}</StructuredListCell>
      <StructuredListCell>
        <span style={{ color: TEXT }}>{value}</span>
        {hint ? <div style={{ fontSize: "0.75rem", color: TEXTD }}>{hint}</div> : null}
      </StructuredListCell>
    </StructuredListRow>
  );

  return (
    <div className="pad">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="lab">Cell data sheet</div>
        <Tag type="teal">{d.archetype}</Tag>
      </div>
      <StructuredListWrapper isCondensed>
        <StructuredListBody>
          {row("Product / family", d.productFamily)}
          {row("Customer takt", d.customerTaktSec > 0 ? `${d.customerTaktSec} s` : "— no demand yet")}
          {row(
            "Work content (weighted)",
            d.workContentWeightedSec == null ? "—" : `${d.workContentWeightedSec} s`,
            d.workContentRawSec != null ? `worst mode ${d.workContentRawSec} s` : undefined,
          )}
          {row(
            "Stations",
            `${d.stationsChosen} chosen`,
            d.stationsCalculated != null ? `calculated ${d.stationsCalculated.toFixed(1)} (loss-factored)` : undefined,
          )}
          {row("Operators", String(d.operators))}
          {row(
            "Bottleneck station",
            d.bottleneck ? <span style={{ color: d.bottleneckOverTaktSec && d.bottleneckOverTaktSec > 0 ? RED : TEXT }}>{d.bottleneck}</span> : "—",
            d.bottleneckOverTaktSec != null ? `${d.bottleneckOverTaktSec > 0 ? "+" : ""}${d.bottleneckOverTaktSec} s vs takt` : undefined,
          )}
          {row("Behaviour at +20 % volume", <span style={{ color: AMBER }}>{d.behaviourAtPlus20}</span>)}
          {row("Line balance efficiency", `${d.lineBalanceEfficiencyPct} %`)}
          {row("Changeover between variants", d.changeoverBetweenVariantsSec === 0 ? "0 s — runs in mix" : `${d.changeoverBetweenVariantsSec} s`)}
          {row("Floor space, cell", `${d.floorSpaceCell.toLocaleString()} ${d.floorSpaceUnit}`)}
          {row("Floor space, material supply", `+${d.floorSpaceMaterialSupply.toLocaleString()} ${d.floorSpaceUnit}`, "the classically forgotten item")}
          {row(
            "Open points",
            d.openPoints.length === 0 ? "none — all inputs firm" : (
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {d.openPoints.map((p, i) => <li key={i} style={{ color: RED }}>{p}</li>)}
              </ul>
            ),
          )}
        </StructuredListBody>
      </StructuredListWrapper>
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 8, lineHeight: 1.5 }}>
        A first pass from the inputs — not a validated concept. Detail engineering,
        safety assessment and investment calculation follow after the concept decision.
      </div>
    </div>
  );
}
