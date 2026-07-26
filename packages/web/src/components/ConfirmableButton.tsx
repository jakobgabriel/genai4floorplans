import { useState } from "react";
import { Button } from "@carbon/react";

// A button that asks for inline confirmation before firing (no browser confirm).
// First click swaps to a confirm/cancel pair; confirm runs onConfirm. Carbon
// Buttons throughout (danger--tertiary for destructive actions).
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
      <Button size="sm" kind={danger ? "danger--tertiary" : "tertiary"} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: "var(--cds-spacing-02)" }}>
      <Button size="sm" kind={danger ? "danger" : "primary"} onClick={() => { onConfirm(); setArmed(false); }}>
        {confirmLabel}
      </Button>
      <Button size="sm" kind="ghost" onClick={() => setArmed(false)}>Cancel</Button>
    </span>
  );
}
