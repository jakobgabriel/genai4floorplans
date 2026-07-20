import type { StationCycle } from "@flowplan/core/engine/cycle";
import { CYCLE_COL, LINE, RED, scoreColor, TEAL, TEXTD } from "./colors";

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

// Yamazumi: per-station cycle stacked by value-add / waste class, against takt.
// Undecomposed stations render as a single hatched "unknown" bar rather than
// being silently drawn as value-add.
export function YamazumiChart({ rows, takt, onSelect }: { rows: StationCycle[]; takt?: number; onSelect?: (id: string) => void }) {
  if (rows.length === 0) return null;
  const rowH = 30;
  const labelW = 116;
  const barW = 330;
  const w = labelW + barW + 52;
  const h = rows.length * rowH + 10;
  const top = Math.max(1, ...rows.map((r) => r.totalSec), takt ?? 0) * 1.04;
  const taktX = takt && takt > 0 ? labelW + (takt / top) * barW : null;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" style={{ maxWidth: w }} aria-label="Cycle time by station, split into value-add and waste">
      {rows.map((r, i) => {
        const y = i * rowH + 5;
        let x = labelW;
        return (
          <g key={r.id} onClick={onSelect ? () => onSelect(r.id) : undefined} style={onSelect ? { cursor: "pointer" } : undefined}>
            <text x={labelW - 8} y={y + rowH / 2 - 2} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={r.overTakt ? RED : "var(--text)"}>
              {r.name.length > 16 ? r.name.slice(0, 15) + "…" : r.name}
            </text>
            <rect x={labelW} y={y + 4} width={barW} height={rowH - 14} rx="2" fill="var(--line)" />
            {r.decomposed ? (
              r.segments.map((seg) => {
                const len = (seg.sec / top) * barW;
                const sx = x;
                x += len;
                return <rect key={seg.key} x={sx} y={y + 4} width={Math.max(0, len)} height={rowH - 14} fill={CYCLE_COL[seg.key]}>
                  <title>{`${r.name} — ${seg.label}: ${seg.sec}s`}</title>
                </rect>;
              })
            ) : (
              <rect x={labelW} y={y + 4} width={(r.totalSec / top) * barW} height={rowH - 14} fill={LINE} stroke={TEXTD} strokeDasharray="3 2">
                <title>{`${r.name} — not decomposed (${r.totalSec}s)`}</title>
              </rect>
            )}
            <text x={labelW + barW + 6} y={y + rowH / 2 - 2} dominantBaseline="middle" fontSize="10.5" fill={r.overTakt ? RED : TEXTD}>
              {r.totalSec}s{r.decomposed && r.valueAddPct != null ? ` · ${r.valueAddPct}%` : ""}
            </text>
          </g>
        );
      })}
      {taktX != null ? (
        <g>
          <line x1={taktX} y1={2} x2={taktX} y2={h - 4} stroke={TEXTD} strokeWidth="1" strokeDasharray="4 3" />
          <text x={taktX + 3} y={9} fontSize="9" fill={TEXTD}>takt</text>
        </g>
      ) : null}
    </svg>
  );
}

// A compact stat tile (big number + caption) for the page summary strips.
export function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="stat-tile">
      <div className="lab">{label}</div>
      <div style={{ fontSize: "1.75rem", fontWeight: 400, color }}>{value}</div>
      {sub ? <div style={{ fontSize: "0.75rem", color: TEXTD }}>{sub}</div> : null}
    </div>
  );
}
