import { type ReactNode } from "react";
import { MenuButton, MenuItem, OverflowMenu, OverflowMenuItem } from "@carbon/react";

// A dropdown action menu backed by Carbon: a kebab "⋯" trigger becomes an
// OverflowMenu (its aria-label is the accessible name, so "Folder actions" and
// "Concept actions" stay distinct); a text label ("Export") becomes a labelled
// MenuButton. Both bring focus trap, keyboard nav, positioning and Esc-to-close.

export interface MenuItemSpec {
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
  items: MenuItemSpec[];
  title?: string;
  align?: "left" | "right";
}) {
  const asText = (n: ReactNode) => (typeof n === "string" ? n : String(n));
  const isKebab = typeof label === "string" && label.trim() === "⋯";

  if (isKebab) {
    // `title` lands on the trigger button (Carbon forwards it), so callers can
    // query it and screen readers get a hover label; `aria-label` covers the
    // container node.
    return (
      <OverflowMenu aria-label={title ?? "Actions"} title={title} size="sm" flipped={align === "right"}>
        {items.map((it, i) => (
          <OverflowMenuItem key={i} itemText={asText(it.label)} disabled={it.disabled} isDelete={it.danger} onClick={it.onClick} />
        ))}
      </OverflowMenu>
    );
  }

  const text = typeof label === "string" ? label.replace(/\s*▾\s*$/, "") : "Menu";
  return (
    <MenuButton label={text} size="sm" kind="ghost" menuAlignment={align === "left" ? "bottom-start" : "bottom-end"}>
      {items.map((it, i) => (
        <MenuItem key={i} label={asText(it.label)} disabled={it.disabled} kind={it.danger ? "danger" : "default"} onClick={it.onClick} />
      ))}
    </MenuButton>
  );
}
