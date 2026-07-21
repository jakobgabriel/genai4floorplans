import type { ReactNode } from "react";
import type { Station } from "@flowplan/core/model/types";
import { fieldQuality } from "@flowplan/core/model/types";
import { stationRate } from "@flowplan/core/engine/balance";
import { AUTO_COL, ERGO_COL, TEXTD } from "./colors";
import { QualityValue } from "./confidence";

// Lightweight HTML tooltip positioned over the canvas on station hover.
export function StationTooltip({ station, x, y, shiftHours }: { station: Station; x: number; y: number; shiftHours: number }) {
  const rate = stationRate(station, shiftHours);
  const row = (k: string, v: ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: TEXTD }}>{k}</span>
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
        background: "var(--cds-layer-02)",
        border: "1px solid var(--cds-border-subtle-01)",
        borderRadius: 0,
        padding: "var(--cds-spacing-03) var(--cds-spacing-04)",
        fontSize: "0.75rem",
        width: 180,
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "var(--cds-spacing-02)" }}>{station.name}</div>
      {row("role · type", `${station.role} · ${station.type}`)}
      {station.role === "process" ? (
        <>
          {row("cycle", <QualityValue value={station.cycleTimeSec} quality={fieldQuality(station, "cycleTimeSec")} unit="s" />)}
          {row("operators", String(station.operators))}
          {row("rate", isFinite(rate) ? `${rate.toLocaleString()}/shift` : "—")}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: TEXTD }}>auto · ergo</span>
            <span>
              <span style={{ color: AUTO_COL[station.auto] }}>{station.auto}</span>
              <span style={{ color: TEXTD }}> · </span>
              <span style={{ color: ERGO_COL[station.ergoRisk] }}>{station.ergoRisk}</span>
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
