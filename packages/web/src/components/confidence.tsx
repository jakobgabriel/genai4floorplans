import type { Confidence, DataQuality } from "@flowplan/core/model/types";
import { DATA_QUALITIES } from "@flowplan/core/model/types";
import { AMBER, RED, TEAL, TEXTD } from "./colors";

// Rendering of a number's provenance (spec §5, fixes Excel failure F8).
//
// The rule: an estimated number renders as a *range*, never a point — a point
// value built from a guess is a lie. Measured/benchmarked render as points with
// a small provenance mark. Confidence is always visible, no hover required.

/** How wide an estimated value's band is, as a fraction of the value. A single
 *  estimated input has no measured spread, so we show a symmetric ±band that
 *  says "this is soft" rather than implying false precision. */
export const ESTIMATE_SPREAD = 0.15;

const QUALITY_LABEL: Record<DataQuality, string> = {
  measured: "measured",
  benchmarked: "benchmarked",
  estimated: "estimated",
};
const QUALITY_COLOR: Record<DataQuality, string> = {
  measured: TEAL,
  benchmarked: AMBER,
  estimated: RED,
};

/** Symmetric estimate band [lo, hi] for a value, rounded to `digits`. */
export function estimateRange(value: number, spread = ESTIMATE_SPREAD): [number, number] {
  const d = Math.abs(value) * spread;
  return [value - d, value + d];
}

function fmt(n: number, digits: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** A small always-visible provenance mark: ● measured, ◑ benchmarked, ▒ estimated. */
export function QualityMark({ quality }: { quality: DataQuality }) {
  const glyph = quality === "measured" ? "●" : quality === "benchmarked" ? "◑" : "▒";
  return (
    <span
      className="qmark"
      style={{ color: QUALITY_COLOR[quality] }}
      title={`${QUALITY_LABEL[quality]} — ${quality === "estimated" ? "shown as a range" : "measured value"}`}
      aria-label={QUALITY_LABEL[quality]}
    >
      {glyph}
    </span>
  );
}

/** A number with its provenance. Estimated → hatched range; else a point + mark. */
export function QualityValue({
  value,
  quality,
  unit,
  digits = 0,
  spread = ESTIMATE_SPREAD,
}: {
  value: number;
  quality: DataQuality;
  unit?: string;
  digits?: number;
  spread?: number;
}) {
  const u = unit ? ` ${unit}` : "";
  if (quality === "estimated") {
    const [lo, hi] = estimateRange(value, spread);
    return (
      <span className="qty qty-est" title={`estimated ${fmt(lo, digits)}–${fmt(hi, digits)}${u}`}>
        <span className="qty-hatch">
          {fmt(lo, digits)}–{fmt(hi, digits)}
          {u}
        </span>
        <QualityMark quality="estimated" />
      </span>
    );
  }
  return (
    <span className="qty">
      {fmt(value, digits)}
      {u} <QualityMark quality={quality} />
    </span>
  );
}

/** Compact 3-state provenance selector for the inspector. */
export function QualitySelect({
  value,
  onChange,
}: {
  value: DataQuality;
  onChange: (q: DataQuality) => void;
}) {
  return (
    <span className="qsel" title="Data quality — estimated values render as a range">
      {DATA_QUALITIES.map((q) => (
        <button
          key={q}
          type="button"
          className={"qsel-btn" + (q === value ? " on" : "")}
          style={q === value ? { color: QUALITY_COLOR[q], borderColor: QUALITY_COLOR[q] } : undefined}
          onClick={() => onChange(q)}
          aria-pressed={q === value}
          title={QUALITY_LABEL[q]}
        >
          {q === "measured" ? "●" : q === "benchmarked" ? "◑" : "▒"}
        </button>
      ))}
    </span>
  );
}

/** Map an aggregate Confidence to a one-word label for derived-figure captions. */
export function confidenceLabel(c: Confidence): string {
  return c === "high" ? "firm" : c === "med" ? "indicative" : "soft";
}

export { TEXTD };
