import type { StationCycle } from "@flowplan/core/engine/cycle";
import { useAccents } from "./colors";

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
  const { scoreColor, TEAL, TEXTD } = useAccents();
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
            <text x={labelW - 8} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={b.highlight ? TEAL : "var(--text-primary)"} fontWeight={b.highlight ? 700 : 400}>
              {b.label.length > 20 ? b.label.slice(0, 19) + "…" : b.label}
            </text>
            <rect x={labelW} y={y + 4} width={barW} height={rowH - 12} rx="3" fill="var(--border)" />
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

// A "nice" axis step (1/2/5 × 10ⁿ) so tick labels land on round seconds.
function niceStep(rough: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const norm = (rough || 1) / mag;
  const mult = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return mult * mag;
}

// Yamazumi: per-station cycle stacked by value-add / waste class, against takt.
// Carbon stacked-bar conventions — square bars on a plot area with a real
// seconds axis and gridlines (no heavy track behind the bars), a reserved
// column for the totals so labels never clip, and a labelled takt marker.
// Undecomposed stations render as a hatched "unknown" bar rather than being
// silently drawn as value-add.
export function YamazumiChart({ rows, takt, onSelect }: { rows: StationCycle[]; takt?: number; onSelect?: (id: string) => void }) {
  const { CYCLE_COL, LINE, RED, TEXTD } = useAccents();
  if (rows.length === 0) return null;
  const rowH = 32;
  const labelW = 128;
  const plotW = 460;
  const valueW = 92; // reserved right column for "95s · 57%"
  const padTop = 22; // room for the takt label
  const padBottom = 30; // room for the axis
  const barH = 16;
  const w = labelW + plotW + valueW;
  const h = rows.length * rowH + padTop + padBottom;
  const top = Math.max(1, ...rows.map((r) => r.totalSec), takt ?? 0) * 1.04;
  const xOf = (sec: number) => labelW + (sec / top) * plotW;
  const plotBottom = padTop + rows.length * rowH;

  const step = niceStep(top / 5);
  const ticks: number[] = [];
  for (let s = 0; s <= top; s += step) ticks.push(s);
  const taktX = takt && takt > 0 ? xOf(takt) : null;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" style={{ maxWidth: w }} aria-label="Cycle time by station, split into value-add and waste">
      {/* Axis gridlines + second ticks. */}
      {ticks.map((s, ti) => (
        <g key={"tick" + ti}>
          <line x1={xOf(s)} y1={padTop} x2={xOf(s)} y2={plotBottom} stroke={LINE} strokeWidth={0.5} opacity={0.5} />
          <text x={xOf(s)} y={plotBottom + 15} textAnchor="middle" fontSize="10" fill={TEXTD}>
            {Math.round(s)}s
          </text>
        </g>
      ))}
      <line x1={labelW} y1={plotBottom} x2={labelW + plotW} y2={plotBottom} stroke={LINE} strokeWidth={1} />

      {rows.map((r, i) => {
        const cy = padTop + i * rowH + rowH / 2;
        const y = cy - barH / 2;
        let x = labelW;
        return (
          <g key={r.id} onClick={onSelect ? () => onSelect(r.id) : undefined} style={onSelect ? { cursor: "pointer" } : undefined}>
            <text x={labelW - 8} y={cy} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={r.overTakt ? RED : "var(--text-primary)"}>
              {r.name.length > 16 ? r.name.slice(0, 15) + "…" : r.name}
            </text>
            {r.decomposed ? (
              r.segments.map((seg) => {
                const len = (seg.sec / top) * plotW;
                const sx = x;
                x += len;
                return (
                  <rect key={seg.key} x={sx} y={y} width={Math.max(0, len)} height={barH} fill={CYCLE_COL[seg.key]}>
                    <title>{`${r.name} — ${seg.label}: ${seg.sec}s`}</title>
                  </rect>
                );
              })
            ) : (
              <rect x={labelW} y={y} width={(r.totalSec / top) * plotW} height={barH} fill="none" stroke={TEXTD} strokeDasharray="3 2">
                <title>{`${r.name} — not decomposed (${r.totalSec}s)`}</title>
              </rect>
            )}
            <text x={labelW + plotW + 8} y={cy} dominantBaseline="middle" fontSize="11" fill={r.overTakt ? RED : TEXTD}>
              {r.totalSec}s{r.decomposed && r.valueAddPct != null ? ` · ${r.valueAddPct}%` : ""}
            </text>
          </g>
        );
      })}

      {taktX != null ? (
        <g>
          <line x1={taktX} y1={padTop - 4} x2={taktX} y2={plotBottom} stroke={TEXTD} strokeWidth="1" strokeDasharray="4 3" />
          <text x={taktX} y={padTop - 8} textAnchor="middle" fontSize="10" fill={TEXTD}>
            takt
          </text>
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
      <div className="u-figure" style={{ color }}>{value}</div>
      {sub ? <div className="u-caption">{sub}</div> : null}
    </div>
  );
}
