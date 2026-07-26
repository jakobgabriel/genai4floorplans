import { IconButton } from "@carbon/react";
import { Close } from "@carbon/icons-react";

// Standardized compact dismiss control for modals/popovers — Carbon IconButton
// with the Carbon Close icon, so it matches the design system's ghost-icon
// geometry and a11y (real button + label) everywhere it is reused.
export function CloseButton({ onClick, title = "Close" }: { onClick: () => void; title?: string }) {
  return (
    <IconButton kind="ghost" size="sm" label={title} align="bottom" onClick={onClick}>
      <Close />
    </IconButton>
  );
}
