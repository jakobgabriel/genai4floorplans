import { useState } from "react";
import { Btn } from "./Btn";

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
      <Btn size="compact" variant={danger ? "danger" : "secondary"} onClick={() => setArmed(true)}>
        {label}
      </Btn>
    );
  }
  return (
    <span className="fk-inlineActions">
      {/* Destructive last in its group. */}
      <Btn size="compact" variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Btn>
      <Btn size="compact" variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); setArmed(false); }}>
        {confirmLabel}
      </Btn>
    </span>
  );
}
