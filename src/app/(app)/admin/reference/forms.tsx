"use client";

import { ActionForm } from "@/components/action-form";
import { Input, Select } from "@/components/ui";
import {
  addListItemAction,
  updateActivityAction,
  updateFeeAction,
  updateListItemAction,
} from "./actions";

const L = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-xs text-muted">{children}</span>;
const Check = ({ name, label, checked }: { name: string; label: string; checked: boolean }) => (
  <label className="flex h-9 items-center gap-2 text-sm">
    <input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4 accent-[var(--accent)]" /> {label}
  </label>
);
const naira = (kobo: number) => (kobo / 100).toFixed(2);

export function FeeRow({ fee }: { fee: { category: string; registrationFee: number; lateInitial: number; lateDaily: number; lateCap: number; description: string } }) {
  return (
    <ActionForm action={updateFeeAction} submitLabel="Save" size="sm" variant="secondary" inline hidden={{ category: fee.category }}>
      <div className="w-10 self-center text-lg font-semibold">{fee.category}</div>
      <label className="min-w-56 flex-1">
        <L>Description</L>
        <Input name="description" defaultValue={fee.description} />
      </label>
      {(
        [
          ["registrationFee", "Registration fee (₦)"],
          ["lateInitial", "Late: initial (₦)"],
          ["lateDaily", "Late: per day (₦)"],
          ["lateCap", "Late: cap (₦)"],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="w-36">
          <L>{label}</L>
          <Input name={k} inputMode="decimal" defaultValue={naira(fee[k])} className="tabular text-right" />
        </label>
      ))}
    </ActionForm>
  );
}

export function ActivityRow({ a, categories }: { a: { code: string; name: string; cat10MwPlus: string; cat1To10Mw: string; catBelow1Mw: string; capacityBased: boolean; active: boolean }; categories: string[] }) {
  return (
    <ActionForm action={updateActivityAction} submitLabel="Save" size="sm" variant="secondary" inline hidden={{ code: a.code }}>
      <div className="min-w-56 flex-1 self-center text-sm">
        <span className="font-medium">{a.name}</span> <span className="font-mono text-xs text-faint">{a.code}</span>
      </div>
      {(
        [
          ["cat10MwPlus", "10 MW+"],
          ["cat1To10Mw", "1–10 MW"],
          ["catBelow1Mw", "Below 1 MW"],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="w-24">
          <L>{label}</L>
          <Select name={k} defaultValue={a[k]}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </label>
      ))}
      <Check name="capacityBased" label="By capacity" checked={a.capacityBased} />
      <Check name="active" label="Active" checked={a.active} />
    </ActionForm>
  );
}

export function ListItemRow({ listKey, item, locked }: { listKey: string; item: { value: string; active: boolean }; locked: boolean }) {
  return (
    <ActionForm action={updateListItemAction} submitLabel="Save" size="sm" variant="ghost" inline hidden={{ listKey, value: item.value, activeField: "1" }}>
      <div className="min-w-48 flex-1 self-center text-sm">
        {item.value}
        {locked ? <span className="ml-2 text-xs text-faint">used by the rules</span> : null}
      </div>
      <Check name="active" label="Active" checked={item.active} />
    </ActionForm>
  );
}

export function AddListItem({ listKey }: { listKey: string }) {
  return (
    <ActionForm action={addListItemAction} submitLabel="Add" size="sm" variant="secondary" inline hidden={{ listKey }} resetOnSuccess>
      <label className="min-w-48 flex-1">
        <L>New value</L>
        <Input name="value" />
      </label>
    </ActionForm>
  );
}
