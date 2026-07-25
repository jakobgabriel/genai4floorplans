import { Modal } from "@carbon/react";

// An in-app confirmation dialog. Carbon's Modal is the container: it traps
// focus, closes on Escape / backdrop / the X, and carries the right ARIA — the
// hand-rolled overlay it replaced did none of that, and Delete/Escape leaked
// through to the canvas behind it.
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
      size="sm"
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
