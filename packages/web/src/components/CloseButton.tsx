import { Close } from "@carbon/icons-react";
import { IconBtn } from "./Btn";

/** Dismiss, for modals and popovers. Same button as everywhere else. */
export function CloseButton({ onClick, title = "Close" }: { onClick: () => void; title?: string }) {
  return <IconBtn size="compact" icon={Close} label={title} tooltipPosition="left" onClick={onClick} />;
}
