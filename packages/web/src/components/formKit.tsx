import type { ReactNode } from "react";
import { NumberInput, Select, SelectItem, TextArea, TextInput } from "@carbon/react";

// ---------------------------------------------------------------------------
// Form kit — thin Carbon field wrappers for the editor panels (Configure,
// Flow, Workload).
//
// These replace the app's bespoke `.field` + raw <input>/<select>/<textarea>
// with Carbon fields, so labels, helper text, focus rings and disabled states
// all come from the design system. Each wrapper keeps the callers terse: they
// pass a value and a plain onChange, and (for the store's drag-friendly history)
// an optional onFocus that snapshots a checkpoint before live edits stream in.
// ---------------------------------------------------------------------------

export function TextField({
  id,
  labelText,
  value,
  placeholder,
  helperText,
  disabled,
  onFocus,
  onChange,
}: {
  id: string;
  labelText: string;
  value: string;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  onFocus?: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <TextInput
      id={id}
      labelText={labelText}
      placeholder={placeholder}
      helperText={helperText}
      value={value}
      disabled={disabled}
      size="sm"
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberField({
  id,
  label,
  value,
  helperText,
  min,
  max,
  step,
  disabled,
  allowEmpty,
  onFocus,
  onChange,
}: {
  id: string;
  label: string;
  value: number | string;
  helperText?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  allowEmpty?: boolean;
  onFocus?: () => void;
  onChange: (v: number | string) => void;
}) {
  return (
    <NumberInput
      id={id}
      label={label}
      helperText={helperText}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      allowEmpty={allowEmpty}
      hideSteppers
      size="sm"
      onFocus={onFocus}
      onChange={(_evt: unknown, state: { value: number | string }) => onChange(state.value)}
    />
  );
}

export function SelectField({
  id,
  labelText,
  value,
  helperText,
  options,
  children,
  onChange,
}: {
  id: string;
  labelText: string;
  value: string;
  helperText?: string;
  options?: readonly string[];
  children?: ReactNode;
  onChange: (v: string) => void;
}) {
  return (
    <Select id={id} labelText={labelText} helperText={helperText} value={value} size="sm" onChange={(e) => onChange(e.target.value)}>
      {options ? options.map((o) => <SelectItem key={o} value={o} text={o} />) : children}
    </Select>
  );
}

export function TextAreaField({
  id,
  labelText,
  value,
  rows,
  helperText,
  onFocus,
  onChange,
}: {
  id: string;
  labelText: string;
  value: string;
  rows?: number;
  helperText?: string;
  onFocus?: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <TextArea id={id} labelText={labelText} helperText={helperText} rows={rows ?? 3} value={value} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} />
  );
}

/** Two fields side by side, matching the old `.row2` two-up layout. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="fk-row">{children}</div>;
}
