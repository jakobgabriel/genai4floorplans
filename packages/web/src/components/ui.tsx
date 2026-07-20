import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

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

// Hover/focus help bubble used to surface the spec's "honest limitations" so the
// rating stays trustworthy rather than looking like a black box.
export function HelpPopover({ text }: { text: string }) {
  return (
    <span className="help" tabIndex={0} role="note" aria-label={text}>
      ?<span className="pop">{text}</span>
    </span>
  );
}

// ---- Toasts -------------------------------------------------------------

export type ToastKind = "info" | "warn" | "err";
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
  const toast = useCallback((msg: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((xs) => xs.concat([{ id, kind, msg }]));
    window.setTimeout(() => setItems((xs) => xs.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={"toast" + (t.kind === "info" ? "" : " " + t.kind)}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
