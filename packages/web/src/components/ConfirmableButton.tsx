import { useState } from "react";

// A button that asks for inline confirmation before firing (no browser confirm).
// First click swaps to a confirm/cancel pair; confirm runs onConfirm.
export function ConfirmableButton({
  label,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button className={"btn sm" + (danger ? " danger" : "")} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <button className={"btn sm" + (danger ? " danger" : "")} onClick={() => { onConfirm(); setArmed(false); }}>
        {confirmLabel}
      </button>
      <button className="btn sm" onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}
