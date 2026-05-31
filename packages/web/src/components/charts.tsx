import { scoreColor, TEAL, TEXTD } from "./colors";

// Lightweight inline-SVG charts (no charting dependency — consistent with the
// hand-drawn layout canvas). Used by the Compare and Site pages.

export interface Bar {
  label: string;
  value: number;
  /** Optional explicit bar color; defaults to a score-based color. */
  color?: string;
  /** Optional formatted value label (defaults to a rounded number). */
  display?: string;
  highlight?: boolean;
}

// Horizontal bar chart — readable with long category labels (scenario/cell names).
export function BarChart({ bars, max, unit, colorByScore = false }: { bars: Bar[]; max?: number; unit?: string; colorByScore?: boolean }) {
  const top = max ?? Math.max(1, ...bars.map((b) => b.value));
  const rowH = 26;
  const labelW = 132;
  const barW = 360;
  const w = labelW + barW + 56;
  const h = bars.length * rowH + 8;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" style={{ maxWidth: w }}>
      {bars.map((b, i) => {
        const y = i * rowH + 4;
        const len = Math.max(0, (b.value / top) * barW);
        const fill = b.color ?? (colorByScore ? scoreColor(b.value) : TEAL);
        return (
          <g key={b.label + i}>
            <text x={labelW - 8} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={b.highlight ? TEAL : "var(--text)"} fontWeight={b.highlight ? 700 : 400}>
              {b.label.length > 20 ? b.label.slice(0, 19) + "…" : b.label}
            </text>
            <rect x={labelW} y={y + 4} width={barW} height={rowH - 12} rx="3" fill="var(--line)" />
            <rect x={labelW} y={y + 4} width={len} height={rowH - 12} rx="3" fill={fill} />
            <text x={labelW + Math.min(len, barW) + 6} y={y + rowH / 2} dominantBaseline="middle" fontSize="10.5" fill={TEXTD}>
              {b.display ?? Math.round(b.value).toLocaleString()}{unit ?? ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// A compact stat tile (big number + caption) for the page summary strips.
export function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="stat-tile">
      <div className="lab">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      {sub ? <div style={{ fontSize: 10.5, color: TEXTD }}>{sub}</div> : null}
    </div>
  );
}
