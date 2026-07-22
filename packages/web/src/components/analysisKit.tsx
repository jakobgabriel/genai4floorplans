import type { ReactNode } from "react";
import { ProgressBar, Tag, Tile, Toggletip, ToggletipButton, ToggletipContent } from "@carbon/react";
import { Information } from "@carbon/icons-react";

// ---------------------------------------------------------------------------
// Analysis kit — Carbon Design System building blocks shared by the readout
// panels (Rating, Balance, Automation, Cost).
//
// The panels used to hand-roll their KPI bars, cards, pills and status banners
// from bespoke CSS classes. These helpers replace that vocabulary with standard
// Carbon components so every tab in the analysis rail reads as one system.
//
// Colour policy: status is expressed through Carbon's own vocabulary only — the
// green / blue / red Tag palette and Carbon field tokens. No bespoke teal/amber
// hexes leak in here; a 0–100 quality score maps to three Carbon bands.
// ---------------------------------------------------------------------------

/** Carbon Tag colour for a 0–100 quality score: good → green, mid → blue, poor → red. */
export function scoreTag(score: number): "green" | "blue" | "red" {
  return score >= 80 ? "green" : score >= 60 ? "blue" : "red";
}

/**
 * A single KPI as a Carbon meter: name + a status Tag carrying the score band,
 * over a neutral ProgressBar filled to the score. Carbon's ProgressBar reserves
 * its coloured `status` for finished/error loading states (which override the
 * fill), so the quality signal rides on the Tag while the bar stays a clean
 * determinate meter.
 */
export function KpiMeter({
  label,
  score,
  raw,
  help,
}: {
  label: string;
  score: number;
  raw?: string;
  help?: string;
}) {
  const pct = Math.round(score);
  return (
    <div className="ak-meter">
      <div className="ak-meter__head">
        <span className="ak-meter__name">
          {label}
          {help ? <HelpTip text={help} /> : null}
        </span>
        <span className="ak-meter__value">
          {raw ? <span className="ak-meter__raw">{raw}</span> : null}
          <Tag type={scoreTag(score)} size="sm">
            {pct}
          </Tag>
        </span>
      </div>
      <ProgressBar label={label} hideLabel size="small" value={pct} max={100} />
    </div>
  );
}

/**
 * A neutral proportion bar (0–100 %) with a leading label and a trailing figure.
 * Used for distributions where every slice is the same kind of thing (Pareto
 * shares, per-step throughput, waste backlog) — no quality colour, just size.
 */
export function ShareBar({
  label,
  value,
  figure,
  emphasis,
  onClick,
}: {
  label: ReactNode;
  value: number;
  figure?: ReactNode;
  emphasis?: ReactNode;
  onClick?: () => void;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const labelText = typeof label === "string" ? label : "value";
  return (
    <div
      className={"ak-share" + (onClick ? " ak-share--clickable" : "")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <div className="ak-share__head">
        <span className="ak-share__label">
          {label}
          {emphasis}
        </span>
        {figure != null ? <span className="ak-share__figure">{figure}</span> : null}
      </div>
      <ProgressBar label={labelText} hideLabel size="small" value={pct} max={100} />
    </div>
  );
}

/**
 * A headline figure in a Carbon Tile: a small caption label, a large value and
 * an optional sub-line. Replaces the bespoke `.imp` / `.impVal` box.
 */
export function MetricTile({
  label,
  value,
  unit,
  sub,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <Tile className="ak-metric">
      <div className="ak-metric__label">{label}</div>
      <div className="ak-metric__value">
        {value}
        {unit != null ? <span className="ak-metric__unit"> {unit}</span> : null}
      </div>
      {sub != null ? <div className="ak-metric__sub">{sub}</div> : null}
    </Tile>
  );
}

/** A section heading inside a readout panel. Carbon label-01 type token. */
export function SectionLabel({ children, help }: { children: ReactNode; help?: string }) {
  return (
    <h3 className="ak-section">
      {children}
      {help ? <HelpTip text={help} /> : null}
    </h3>
  );
}

/** Muted explanatory footnote under a section. */
export function Footnote({ children }: { children: ReactNode }) {
  return <p className="ak-footnote">{children}</p>;
}

/** Standard Carbon information affordance — replaces the bespoke help bubble. */
export function HelpTip({ text }: { text: string }) {
  return (
    <Toggletip align="top" className="ak-help">
      <ToggletipButton label="More information">
        <Information />
      </ToggletipButton>
      <ToggletipContent>
        <p>{text}</p>
      </ToggletipContent>
    </Toggletip>
  );
}
