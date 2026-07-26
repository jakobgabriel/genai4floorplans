import type { ReactNode } from "react";
import { Tile } from "@carbon/react";
import { HelpPopover } from "./ui";

// ---------------------------------------------------------------------------
// Dashboard kit — the airy Carbon vocabulary the Analysis Overview introduced
// (`.bi-*`), shared by the routed readout pages (report, concepts, recommend)
// so they read as one system. A KPI tile for a headline number and a titled
// card for a section; both are plain Carbon Tiles wearing the `.bi` classes.
// ---------------------------------------------------------------------------

/** A headline number in a KPI band — the dashboard's `.bi-kpi` tile. */
export function KpiTile({
  label,
  value,
  sub,
  color,
  help,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  help?: string;
}) {
  return (
    <Tile className="bi-kpi">
      <div className="bi-kpi__lab">
        {label}
        {help ? <HelpPopover text={help} /> : null}
      </div>
      <div className="bi-kpi__val" style={{ color }}>
        {value}
      </div>
      {sub != null ? <div className="bi-kpi__sub">{sub}</div> : null}
    </Tile>
  );
}

/** A section as a dashboard card: a titled Carbon Tile. `wide` spans the full
 *  row (default); drop it for cards that pair up in a two-column support row. */
export function DashCard({
  n,
  title,
  help,
  lead,
  actions,
  wide = true,
  children,
}: {
  n?: string;
  title: ReactNode;
  help?: string;
  lead?: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Tile className={"bi-card" + (wide ? " bi-card--wide" : "")}>
      <div className="bi-card__head">
        <h3 className="bi-card__title">
          {n ? <span className="rep__num">{n}</span> : null}
          {title}
          {help ? <HelpPopover text={help} /> : null}
        </h3>
        {actions}
      </div>
      {lead != null ? <p className="bi-card__sublab">{lead}</p> : null}
      {children}
    </Tile>
  );
}
