import { Button, Checkbox, Select, SelectItem, TextInput } from "@carbon/react";
import { Add, TrashCan } from "@carbon/icons-react";
import { FIELD_TYPES, type CustomField, type FieldType } from "@flowplan/core/model/library";
import { IconBtn } from "./Btn";
import { SectionLabel } from "./analysisKit";

// A typed custom-field editor, shared by the process library and the concept
// catalog. A field is a label, a type, and a value; the type drives the input
// (a number spinner, a date/time picker, a checkbox, a currency or percent
// field, a link) and how the value reads back — so "Drawing rev" as a date and
// "Datasheet" as a link are entered as what they are, not as free text everyone
// has to remember the format of.

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  time: "Time",
  boolean: "Yes / No",
  currency: "Currency",
  percent: "Percent",
  url: "Link",
};
// The native <input type> each field maps to. currency and percent are numeric
// with a unit shown alongside; boolean renders as a checkbox instead.
const INPUT_TYPE: Record<FieldType, string> = {
  text: "text",
  number: "number",
  date: "date",
  time: "time",
  boolean: "text",
  currency: "number",
  percent: "number",
  url: "url",
};
const PLACEHOLDER: Record<FieldType, string> = {
  text: "Value",
  number: "0",
  date: "",
  time: "",
  boolean: "",
  currency: "0.00",
  percent: "0",
  url: "https://…",
};
// A trailing unit rendered inside the value cell for the numeric money/ratio types.
const UNIT: Partial<Record<FieldType, string>> = { currency: "¤", percent: "%" };

export function CustomFields({
  fields,
  onAdd,
  onUpdate,
  onRemove,
}: {
  fields: CustomField[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<CustomField>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <SectionLabel>Custom fields</SectionLabel>
      {fields.length === 0 ? (
        <p className="u-caption">None yet — add plant standards, drawing numbers, datasheet links…</p>
      ) : null}
      {fields.map((f) => {
        const t = f.type ?? "text";
        return (
          <div className="cf-row" key={f.id}>
            <TextInput
              id={"cf-l-" + f.id}
              labelText="Field"
              hideLabel
              size="sm"
              placeholder="Standard no."
              value={f.label}
              onChange={(e) => onUpdate(f.id, { label: e.target.value })}
            />
            <Select
              id={"cf-t-" + f.id}
              labelText="Type"
              hideLabel
              size="sm"
              value={t}
              onChange={(e) => onUpdate(f.id, { type: e.target.value as FieldType })}
            >
              {FIELD_TYPES.map((x) => (
                <SelectItem key={x} value={x} text={TYPE_LABEL[x]} />
              ))}
            </Select>
            {t === "boolean" ? (
              <div className="cf-bool">
                <Checkbox
                  id={"cf-v-" + f.id}
                  labelText={f.value === "true" ? "Yes" : "No"}
                  checked={f.value === "true"}
                  onChange={(_e: unknown, { checked }: { checked: boolean }) =>
                    onUpdate(f.id, { value: checked ? "true" : "false" })
                  }
                />
              </div>
            ) : (
              <div className="cf-value">
                <TextInput
                  id={"cf-v-" + f.id}
                  labelText="Value"
                  hideLabel
                  size="sm"
                  type={INPUT_TYPE[t]}
                  placeholder={PLACEHOLDER[t]}
                  value={f.value}
                  onChange={(e) => onUpdate(f.id, { value: e.target.value })}
                />
                {UNIT[t] ? <span className="cf-unit">{UNIT[t]}</span> : null}
              </div>
            )}
            <IconBtn
              size="compact"
              icon={TrashCan}
              label={"Remove the " + (f.label || "empty") + " field"}
              tooltipPosition="left"
              onClick={() => onRemove(f.id)}
            />
          </div>
        );
      })}
      <Button kind="ghost" size="sm" renderIcon={Add} onClick={onAdd}>
        Add a field
      </Button>
    </>
  );
}
