import { useEffect, useRef, useState, type ReactNode } from "react";

// A small dropdown menu: a button that toggles a popover list of actions. Closes
// on item-select, outside-click, and Escape. Unlike the modals (which close from
// App's global Esc handler) and FlowEditorPopover (no outside-click), this owns
// its own dismissal, so it's the reusable primitive for header action menus.

export interface MenuItem {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function Menu({
  label,
  items,
  title,
  align = "right",
}: {
  label: ReactNode;
  items: MenuItem[];
  title?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button className="btn" title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open ? (
        <div className={"menu-pop" + (align === "left" ? " left" : "")} role="menu">
          {items.map((it, i) => (
            <button
              key={i}
              role="menuitem"
              className={it.danger ? "danger" : undefined}
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
