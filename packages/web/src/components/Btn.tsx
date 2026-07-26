import type { ComponentType, ReactNode } from "react";
import { Button } from "@carbon/react";

/**
 * The button.
 *
 * There were two parallel systems: a hand-rolled `.btn` (in seven spellings —
 * `btn`, `btn sm`, `btn on`, `btn sm danger`, `btn help-tab`, `btn sm rail-btn`,
 * `btn-close`) and Carbon's `<Button>` (in five kinds), plus 59 raw `<button>`
 * elements that used neither. Twelve variants and four sizes for what is really
 * four intents.
 *
 * Everything routes through here now, and here is a thin wrapper over Carbon —
 * so hover, active, focus-visible, disabled and loading come from the design
 * system rather than from whichever rule happened to win.
 *
 *   variant   primary | secondary | ghost | danger
 *   size      default | compact
 *
 * Placement convention, applied everywhere:
 *   - Toolbars: primary first, then secondary, then ghost/icon actions.
 *   - Forms and modals: actions bottom-right, primary rightmost.
 *   - Table rows and list rows: the row's own action trails the row, ghost.
 *   - Destructive actions are last in their group, always.
 */

export type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

const KIND: Record<BtnVariant, string> = {
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
  // Carbon reserves solid `danger` for the confirming button in a destructive
  // dialog. Everywhere else a destructive action is an outline, so it does not
  // out-shout the primary action next to it.
  danger: "danger--tertiary",
};

interface Common {
  variant?: BtnVariant;
  /** `compact` is Carbon's `sm`: toolbars, list rows, anywhere dense. */
  size?: "default" | "compact";
  disabled?: boolean;
  title?: string;
  className?: string;
  onClick?: () => void;
}

export interface BtnProps extends Common {
  children: ReactNode;
  /** Leading icon. Icon-only buttons use `IconBtn` instead. */
  icon?: ComponentType;
  /** Toggle state, for buttons that are on or off (views, tabs, modes).
   *  Selected reads as primary, unselected as ghost — one implementation of
   *  what `.btn.on` used to do in four places. */
  selected?: boolean;
  /** Marks the button as controlling a region, for toggles. */
  pressed?: boolean;
  /** For a menu/disclosure trigger: announces the popup and whether it is open,
   *  so assistive tech reports "menu, collapsed/expanded" rather than a bare
   *  button. Use instead of `pressed` on a menu button. */
  hasPopup?: boolean;
  expanded?: boolean;
  type?: "button" | "submit";
}

export function Btn({
  children,
  variant = "secondary",
  size = "default",
  selected,
  pressed,
  hasPopup,
  expanded,
  icon,
  disabled,
  title,
  className,
  type = "button",
  onClick,
}: BtnProps) {
  const kind = selected === undefined ? KIND[variant] : selected ? "primary" : "ghost";
  return (
    <Button
      kind={kind as never}
      size={size === "compact" ? "sm" : "md"}
      type={type}
      disabled={disabled}
      title={title}
      className={className}
      renderIcon={icon as never}
      aria-pressed={pressed ?? (selected !== undefined ? selected : undefined)}
      aria-haspopup={hasPopup ? "menu" : undefined}
      aria-expanded={hasPopup ? !!expanded : undefined}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * A tab, not a button.
 *
 * The view switcher and the side-panel group tabs were `.btn.on` — a *button*
 * with a selected state — while the sub-tabs and the analysis nav were `.chip`.
 * Three stylings for one affordance. They are all this now: an underlined tab
 * that reports its own selected state to assistive tech.
 */
export function TabBtn({
  children,
  selected,
  title,
  onClick,
}: {
  children: ReactNode;
  selected: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={"chip" + (selected ? " on" : "")}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export interface IconBtnProps extends Common {
  icon: ComponentType;
  /** Required: an icon-only button has no visible name. Also the tooltip. */
  label: string;
  tooltipPosition?: "top" | "bottom" | "left" | "right";
  selected?: boolean;
}

/**
 * Icon-only. The label is mandatory — it becomes both the accessible name and
 * the tooltip — and the target is padded to 44x44 by `.cds--btn--icon-only` in
 * tokens.css, so a thumb can hit it.
 */
export function IconBtn({
  icon,
  label,
  variant = "ghost",
  size = "default",
  selected,
  disabled,
  className,
  tooltipPosition = "bottom",
  onClick,
}: IconBtnProps) {
  // Carbon's icon-only Button accepts only primary/secondary/ghost/tertiary —
  // the danger kinds are rejected outright, and passing `danger--tertiary`
  // logged a propType warning on every render and fell back to a plain button
  // with no destructive signal at all. A ghost carrying the destructive colour
  // is the icon-only equivalent.
  const danger = variant === "danger" && selected === undefined;
  const kind = selected === undefined ? (danger ? "ghost" : KIND[variant]) : selected ? "primary" : "ghost";
  return (
    <Button
      hasIconOnly
      kind={kind as never}
      size={size === "compact" ? "sm" : "md"}
      renderIcon={icon as never}
      iconDescription={label}
      tooltipPosition={tooltipPosition}
      disabled={disabled}
      className={[className, danger ? "btn--dangerIcon" : ""].filter(Boolean).join(" ") || undefined}
      aria-pressed={selected}
      onClick={onClick}
    />
  );
}
