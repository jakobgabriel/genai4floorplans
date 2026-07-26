import { Modal } from "@carbon/react";

// An in-app confirmation modal — Carbon Modal (danger variant for destructive
// actions). Replaces window.confirm and the old hand-rolled .overlay/.modal so
// focus trap, Esc-to-close and the button geometry all come from Carbon.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      danger={danger}
      modalHeading={title}
      primaryButtonText={confirmLabel}
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onRequestSubmit={() => {
        onConfirm();
        onClose();
      }}
    >
      <p>{message}</p>
    </Modal>
  );
}
