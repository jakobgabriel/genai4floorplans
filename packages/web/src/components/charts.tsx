import type { StationCycle } from "@flowplan/core/engine/cycle";
import { CYCLE_COL, RED, scoreColor, TEAL, TEXTD } from "./colors";

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

/** A "nice" axis step (1/2/5 × 10ⁿ) at or above raw, so gridline labels are round. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// Yamazumi — the lean workhorse. VERTICAL stacked bars: one column per station,
// cycle time on the y-axis, stacked by value-add / waste class, with a takt
// reference line. Undecomposed stations render as a single hatched column.
// Follows the dataviz method: bars anchored to the baseline, a 2px surface gap
// between stacked segments, a recessive gridded y-axis, selective direct labels
// (total on top), a legend (owned by the dashboard) and per-segment hover.
export function YamazumiChart({ rows, takt, onSelect }: { rows: StationCycle[]; takt?: number; onSelect?: (id: string) => void }) {
  if (rows.length === 0) return null;

  // Fixed intrinsic size (px) so the chart is not upscaled to the container —
  // it renders at its natural height and scrolls horizontally when there are
  // many stations (the global `svg { max-width:100% }` only ever shrinks it).
  const padT = 20; // room for the total label above the tallest bar
  const padB = 56; // rotated station names
  const axisW = 40; // y-axis labels
  const rightPad = 16;
  const plotH = 240;
  const band = 88;
  const barW = 52;
  const h = padT + plotH + padB;
  const w = axisW + rows.length * band + rightPad;
  const baseY = padT + plotH;

  const top = Math.max(1, ...rows.map((r) => r.totalSec), takt ?? 0) * 1.08;
  const yOf = (sec: number) => baseY - (sec / top) * plotH;

  const step = niceStep(top / 4);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" preserveAspectRatio="xMinYMid meet" style={{ height: "auto" }} aria-label="Cycle time by station, split into value-add and waste, against takt">
      {/* Recessive gridlines + y-axis labels (seconds). */}
      {ticks.map((t) => (
        <g key={"g" + t}>
          <line x1={axisW} y1={yOf(t)} x2={w - rightPad} y2={yOf(t)} stroke="var(--cds-border-subtle-01)" strokeWidth="1" />
          <text x={axisW - 6} y={yOf(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill={TEXTD}>{Math.round(t)}</text>
        </g>
      ))}
      <text x={12} y={padT - 8} fontSize="10" fill={TEXTD}>sec</text>

      {/* Bars */}
      {rows.map((r, i) => {
        const cx = axisW + i * band + (band - barW) / 2;
        let cursorY = baseY;
        const shortName = r.name.length > 12 ? r.name.slice(0, 11) + "…" : r.name;
        return (
          <g key={r.id} onClick={onSelect ? () => onSelect(r.id) : undefined} style={onSelect ? { cursor: "pointer" } : undefined}>
            {r.decomposed ? (
              r.segments.map((seg) => {
                const segH = (seg.sec / top) * plotH;
                if (segH <= 0) return null;
                const y = cursorY - segH;
                cursorY = y;
                // 1px inset top+bottom → a 2px surface gap between stacked fills.
                return (
                  <rect key={seg.key} x={cx} y={y + 1} width={barW} height={Math.max(0, segH - 2)} fill={CYCLE_COL[seg.key]}>
                    <title>{`${r.name} — ${seg.label}: ${seg.sec}s`}</title>
                  </rect>
                );
              })
            ) : (
              <rect x={cx} y={yOf(r.totalSec)} width={barW} height={baseY - yOf(r.totalSec)} fill="var(--cds-layer-02)" stroke={TEXTD} strokeDasharray="3 2">
                <title>{`${r.name} — not decomposed (${r.totalSec}s)`}</title>
              </rect>
            )}
            {/* Total label above the bar. */}
            <text x={cx + barW / 2} y={yOf(r.totalSec) - 6} textAnchor="middle" fontSize="11" fontWeight={600} fill={r.overTakt ? RED : "var(--cds-text-primary)"}>
              {r.totalSec}s
            </text>
            {/* Station name, rotated to avoid collisions. */}
            <text x={cx + barW / 2} y={baseY + 10} transform={`rotate(35 ${cx + barW / 2} ${baseY + 10})`} textAnchor="start" fontSize="10.5" fill={r.overTakt ? RED : TEXTD}>
              {shortName}
            </text>
          </g>
        );
      })}

      {/* Baseline */}
      <line x1={axisW} y1={baseY} x2={w - rightPad} y2={baseY} stroke="var(--cds-border-strong-01)" strokeWidth="1" />

      {/* Takt reference line */}
      {takt && takt > 0 ? (
        <g>
          <line x1={axisW} y1={yOf(takt)} x2={w - rightPad} y2={yOf(takt)} stroke={RED} strokeWidth="1.5" strokeDasharray="5 3" />
          <text x={w - rightPad} y={yOf(takt) - 4} textAnchor="end" fontSize="10" fontWeight={600} fill={RED}>takt {takt.toFixed(1)}s</text>
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
