import type { Station } from "@flowplan/core/model/types";
import { stationRate } from "@flowplan/core/engine/balance";
import { AUTO_COL, ERGO_COL } from "./colors";

// Lightweight HTML tooltip positioned over the canvas on station hover.
export function StationTooltip({ station, x, y, shiftHours }: { station: Station; x: number; y: number; shiftHours: number }) {
  const rate = stationRate(station, shiftHours);
  const row = (k: string, v: string) => (
    <div className="u-row u-row--between">
      <span className="u-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
  return (
    <div
      style={{
        position: "fixed",
        left: Math.min(x + 14, window.innerWidth - 200),
        top: y + 14,
        zIndex: 60,
        pointerEvents: "none",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 11,
        width: 180,
        boxShadow: "0 6px 20px rgba(0,0,0,.45)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, fontFamily: "'IBM Plex Sans',sans-serif" }}>{station.name}</div>
      {row("role · type", `${station.role} · ${station.type}`)}
      {station.role === "process" ? (
        <>
          {row("cycle", `${station.cycleTimeSec}s`)}
          {row("operators", String(station.operators))}
          {row("rate", isFinite(rate) ? `${rate.toLocaleString()}/shift` : "—")}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="u-muted">auto · ergo</span>
            <span>
              <span style={{ color: AUTO_COL[station.auto] }}>{station.auto}</span>
              <span className="u-muted"> · </span>
              <span style={{ color: ERGO_COL[station.ergoRisk] }}>{station.ergoRisk}</span>
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
