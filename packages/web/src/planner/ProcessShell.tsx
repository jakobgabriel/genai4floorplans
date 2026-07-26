import type { ReactNode } from "react";
import { HeaderGlobalAction, ProgressIndicator, ProgressStep, Theme } from "@carbon/react";
import type { FlowStep } from "./flow";
import { FLOW_STEPS, STEP_META } from "./flow";
import type { CarbonTheme } from "../store/theme";
import { AppHeader } from "../components/AppHeader";

// One shell for the whole application. The process stepper is always present,
// so the editor is visibly a *stage of planning* rather than a separate tool you
// jump to and lose your place in.

interface Props {
  step: FlowStep;
  /** Steps the user may jump back to; later steps stay locked until reached. */
  reached: FlowStep[];
  onGoto: (step: FlowStep) => void;
  actions?: ReactNode;
  children: ReactNode;
  /** Editor mode: hide the process stepper and let the body fill the viewport,
   *  so the node-RED editor runs full-screen below the top bar. */
  fullBleed?: boolean;
  theme: CarbonTheme;
  onToggleTheme: () => void;
}

export function ProcessShell({ step, reached, onGoto, actions, children, fullBleed = false, theme, onToggleTheme }: Props) {
  const index = FLOW_STEPS.indexOf(step);

  return (
    <Theme theme={theme}>
      <AppHeader theme={theme} onToggleTheme={onToggleTheme} active="editor" actions={actions} />

      <div className={"shell" + (fullBleed ? " shell--editor" : "")}>
        {fullBleed ? null : (
          <nav className="shell__steps" aria-label="Planning process">
            <ProgressIndicator
              currentIndex={index}
              spaceEqually
              onChange={(i: number) => {
                const target = FLOW_STEPS[i];
                if (target && reached.includes(target)) onGoto(target);
              }}
            >
              {FLOW_STEPS.map((s) => (
                <ProgressStep key={s} label={STEP_META[s].label} disabled={!reached.includes(s)} />
              ))}
            </ProgressIndicator>
          </nav>
        )}

        <div className="shell__body">{children}</div>
      </div>
    </Theme>
  );
}

/** Carbon header action, so callers don't import Carbon directly. */
export function ShellAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <HeaderGlobalAction aria-label={label} onClick={onClick} tooltipAlignment="end">
      <span className="shell__actionLabel">{label}</span>
    </HeaderGlobalAction>
  );
}
