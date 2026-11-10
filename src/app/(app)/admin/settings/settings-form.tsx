"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, FormErrors, Input, Notice, Select } from "@/components/ui";
import { SETTING_META, type SettingKey, type SettingMeta, type Settings } from "@/domain/settings";
import { saveSettingsAction } from "../actions";

const GROUPS: SettingMeta["group"][] = ["Order parameters", "Policy settings", "Receipt and letters", "Security"];

function Control({ k, meta, value, disabled, invalid }: { k: SettingKey; meta: SettingMeta; value: unknown; disabled: boolean; invalid: boolean }) {
  const common = { id: k, name: k, disabled, "aria-invalid": invalid || undefined };
  switch (meta.kind) {
    case "boolean":
      return <input type="checkbox" {...common} defaultChecked={!!value} className="h-4 w-4 accent-[var(--accent)]" />;
    case "yn":
      return (
        <Select {...common} defaultValue={String(value)} className="w-24">
          <option value="Y">Y</option>
          <option value="N">N</option>
        </Select>
      );
    case "choice":
      return (
        <Select {...common} defaultValue={String(value)} className="w-56">
          {meta.choices?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      );
    case "date":
      return <Input type="date" {...common} defaultValue={(value as string | null) ?? ""} className="w-44" />;
    case "time":
      return <Input type="time" {...common} defaultValue={String(value)} className="w-32" />;
    case "days":
    case "number":
      return <Input type="number" min={0} step="any" {...common} defaultValue={value === null ? "" : String(value)} className="w-32" />;
    default:
      return <Input type="text" {...common} defaultValue={String(value ?? "")} />;
  }
}

export function SettingsForm({ settings, editable }: { settings: Settings; editable: boolean }) {
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  const fieldErrors = state && !state.ok ? state.fieldErrors : {};
  const entries = Object.entries(SETTING_META) as [SettingKey, SettingMeta][];

  return (
    <form action={action} className="flex flex-col gap-6">
      {state && !state.ok ? <FormErrors reasons={[...state.reasons, ...Object.values(state.fieldErrors).flat()]} /> : null}
      {state?.ok ? (
        <Notice tone="accent" title={state.message}>
          {state.data.length ? (
            <ul className="list-disc pl-5">
              {state.data.map((c) => (
                <li key={c.key}>
                  {c.label}: {c.from} → {c.to}
                </li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      {GROUPS.map((group) => (
        <Card key={group}>
          <CardHeader title={group} />
          <CardBody className="divide-y divide-border/60 py-0">
            {entries
              .filter(([, m]) => m.group === group)
              .map(([k, meta]) => (
                <div key={k} className="grid gap-2 py-4 md:grid-cols-[1fr_minmax(0,22rem)] md:gap-6">
                  <div>
                    <label htmlFor={k} className="text-sm font-medium">
                      {meta.label}
                    </label>
                    <p className="mt-0.5 text-xs text-muted">{meta.note}</p>
                    <p className="mt-0.5 text-[11px] text-faint">Source: {meta.source}</p>
                    {fieldErrors[k] ? <p className="mt-1 text-xs text-danger">{fieldErrors[k].join(" ")}</p> : null}
                  </div>
                  <div className="flex items-start md:justify-end">
                    <Control k={k} meta={meta} value={settings[k]} disabled={!editable} invalid={!!fieldErrors[k]} />
                  </div>
                </div>
              ))}
          </CardBody>
        </Card>
      ))}

      {editable ? (
        <div className="sticky bottom-0 -mx-1 flex justify-end border-t border-border bg-bg/90 px-1 py-3 backdrop-blur">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
