import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ToastNotification, Toggletip, ToggletipButton, ToggletipContent } from "@carbon/react";
import { Information } from "@carbon/icons-react";

export function Field(props: { label: string; help?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className={props.aside ? "field-lab-row" : undefined}>
        {props.label}
        {props.help ? <HelpPopover text={props.help} /> : null}
        {props.aside}
      </span>
      {props.children}
    </label>
  );
}

// Help affordance surfacing the spec's "honest limitations" so the rating stays
// trustworthy rather than looking like a black box. Carbon Toggletip: an
// accessible info button with a popover (focus, Esc, positioning handled).
export function HelpPopover({ text }: { text: string }) {
  return (
    <Toggletip align="top" className="help-toggletip">
      <ToggletipButton label="More information">
        <Information size={16} />
      </ToggletipButton>
      <ToggletipContent>
        <p>{text}</p>
      </ToggletipContent>
    </Toggletip>
  );
}

// ---- Toasts (Carbon ToastNotification) ----------------------------------

export type ToastKind = "info" | "warn" | "err";
const CARBON_KIND: Record<ToastKind, "info" | "warning" | "error"> = { info: "info", warn: "warning", err: "error" };
interface Toast {
  id: number;
  kind: ToastKind;
  msg: string;
}
interface ToastApi {
  toast: (msg: string, kind?: ToastKind) => void;
}
const ToastCtx = createContext<ToastApi>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);
  const toast = useCallback((msg: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((xs) => xs.concat([{ id, kind, msg }]));
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <ToastNotification
            key={t.id}
            kind={CARBON_KIND[t.kind]}
            title={t.msg}
            lowContrast
            timeout={3200}
            onClose={() => {
              dismiss(t.id);
              return true;
            }}
          />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
