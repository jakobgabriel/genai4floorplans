import type { ReactNode } from "react";
import { Header, HeaderGlobalAction, HeaderGlobalBar, HeaderMenuItem, HeaderName, HeaderNavigation } from "@carbon/react";
import { Asleep, Light } from "@carbon/icons-react";
import type { CarbonTheme } from "../store/theme";

// The single application top bar — identical on every route (workspace, pages,
// planner, editor). Carbon UI Shell: brand + primary navigation + a global bar
// carrying any page actions and the theme toggle. Rendering one component
// everywhere is what keeps the top bar consistent.

export type HeaderSection = "workspace" | "site" | "library" | "compare" | "editor" | null;

const NAV: { id: HeaderSection; label: string; href: string }[] = [
  { id: "workspace", label: "Workspace", href: "#/workspace" },
  { id: "editor", label: "Editor", href: "#/" },
  { id: "site", label: "Site", href: "#/site" },
  { id: "compare", label: "Compare", href: "#/compare" },
  { id: "library", label: "Library", href: "#/library" },
];

export function AppHeader({
  theme,
  onToggleTheme,
  active = null,
  actions,
}: {
  theme: CarbonTheme;
  onToggleTheme: () => void;
  active?: HeaderSection;
  /** Optional page-specific global actions, placed left of the theme toggle. */
  actions?: ReactNode;
}) {
  return (
    <Header aria-label="FlowPlan">
      <HeaderName href="#/workspace" prefix="Flow">
        Plan
      </HeaderName>
      <HeaderNavigation aria-label="FlowPlan sections">
        {NAV.map((n) => (
          <HeaderMenuItem key={n.label} href={n.href} isActive={active === n.id}>
            {n.label}
          </HeaderMenuItem>
        ))}
      </HeaderNavigation>
      <HeaderGlobalBar>
        {actions}
        <HeaderGlobalAction
          aria-label={theme === "g100" ? "Switch to light theme" : "Switch to dark theme"}
          tooltipAlignment="end"
          onClick={onToggleTheme}
        >
          {theme === "g100" ? <Light size={20} /> : <Asleep size={20} />}
        </HeaderGlobalAction>
      </HeaderGlobalBar>
    </Header>
  );
}
