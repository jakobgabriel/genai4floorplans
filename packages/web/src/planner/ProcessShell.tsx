import type { ReactNode } from "react";
import { Header, HeaderGlobalBar, HeaderGlobalAction, HeaderName, ProgressIndicator, ProgressStep, Theme } from "@carbon/react";
import type { FlowStep } from "./flow";
import { FLOW_STEPS, STEP_META } from "./flow";

// One shell for the whole application. The process stepper is always present,
// so the editor is visibly a *stage of planning* rather than a separate tool you
// jump to and lose your place in.

interface Props {
  step: FlowStep;
  /** Steps the user may jump back to; later steps stay locked until reached. */
  reached: FlowStep[];
  onGoto: (step: FlowStep) => void;
  actions?: ReactNode;
  /**
   * Pin the shell to the viewport instead of letting content grow it.
   *
   * The wizard steps scroll like a normal page, but the editor is a fixed
   * three-column workbench: the canvas can only fill the space between the
   * rails if that space is bounded by the window rather than by whichever side
   * panel happens to be tallest.
   */
  fill?: boolean;
  children: ReactNode;
}

export function ProcessShell({ step, reached, onGoto, actions, fill, children }: Props) {
  const index = FLOW_STEPS.indexOf(step);

  return (
    <AppFrame actions={actions} fill={fill}>
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

      <div className="shell__body">{children}</div>
    </AppFrame>
  );
}

/**
 * The theme, the header and the page background — everything the shell is
 * apart from the stepper.
 *
 * The start screen needs the frame but not the stepper: before you have chosen
 * to plan something or to open something, there is no stage to be on, and a
 * progress bar showing four stages you have not entered is a decoration.
 */
export function AppFrame({
  actions,
  fill,
  children,
}: {
  actions?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <Theme theme="g100">
      <Header aria-label="FlowPlan">
        <HeaderName href="#" prefix="Flow">
          Plan
        </HeaderName>
        <HeaderGlobalBar>{actions}</HeaderGlobalBar>
      </Header>
      <div className={"shell" + (fill ? " shell--fill" : "")}>{children}</div>
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
