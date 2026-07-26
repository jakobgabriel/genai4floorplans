import { useState, type ReactNode } from "react";
import { ChevronDown } from "@carbon/icons-react";

/**
 * A full-width, collapsible section with an accessible disclosure header.
 *
 * The header is a real <button> carrying `aria-expanded` and `aria-controls`;
 * the body is a labelled region that is `hidden` (removed from the a11y tree)
 * when collapsed. Keyboard and screen-reader users get the native button
 * semantics for free — no custom key handling, no focus traps.
 */
export function CollapsibleSection({
  id,
  title,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = id + "-panel";
  const btnId = id + "-btn";
  return (
    <section className="clps" id={id}>
      <h2 className="clps__h">
        <button
          id={btnId}
          type="button"
          className="clps__btn"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown size={20} aria-hidden className={"clps__chev" + (open ? " clps__chev--open" : "")} />
          <span>{title}</span>
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={btnId} className="clps__body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
