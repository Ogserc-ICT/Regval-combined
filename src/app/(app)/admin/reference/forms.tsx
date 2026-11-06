"use client";

import { ActionForm } from "@/components/action-form";
import { Input, Select } from "@/components/ui";
import {
  addListItemAction,
  saveDivisionAction,
  saveTypeAction,
  saveUnitAction,
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

export function DivisionRow({ d }: { d?: { id: string; name: string; email: string | null } }) {
  return (
    <ActionForm action={saveDivisionAction} submitLabel={d ? "Save" : "Add division"} size="sm" variant="secondary" inline hidden={{ id: d?.id ?? "" }} resetOnSuccess={!d}>
      <label className="min-w-56 flex-1">
        <L>Division</L>
        <Input name="name" defaultValue={d?.name} />
      </label>
      <label className="min-w-64 flex-1">
        <L>Email(s), separated by ;</L>
        <Input name="email" defaultValue={d?.email ?? ""} aria-invalid={d && !d.email ? true : undefined} placeholder="No address" />
      </label>
    </ActionForm>
  );
}

export function UnitRow({
  u,
  divisions,
}: {
  u?: { id: string; name: string; divisionId: string | null; unitGroup: string | null; email: string | null; active: boolean };
  divisions: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={saveUnitAction} submitLabel={u ? "Save" : "Add unit"} size="sm" variant="secondary" inline hidden={{ id: u?.id ?? "" }} resetOnSuccess={!u}>
      <label className="min-w-56 flex-1">
        <L>Unit</L>
        <Input name="name" defaultValue={u?.name} />
      </label>
      <label className="w-56">
        <L>Division</L>
        <Select name="divisionId" defaultValue={u?.divisionId ?? ""}>
          <option value="">—</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="min-w-56 flex-1">
        <L>Email(s), separated by ;</L>
        <Input name="email" defaultValue={u?.email ?? ""} placeholder="No address" />
      </label>
      <label className="w-36">
        <L>Group</L>
        <Input name="unitGroup" defaultValue={u?.unitGroup ?? ""} />
      </label>
      {u ? <Check name="active" label="Active" checked={u.active} /> : null}
    </ActionForm>
  );
}

export function TypeRow({
  t,
  units,
}: {
  t?: { id: string; name: string; category: string; defaultUnitId: string | null; orderRef: string | null; responseTargetDays: number; para103Wording: boolean; filingType: string | null; active: boolean };
  units: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={saveTypeAction} submitLabel={t ? "Save" : "Add type"} size="sm" variant="secondary" inline hidden={{ id: t?.id ?? "" }} resetOnSuccess={!t}>
      <label className="min-w-56 flex-1">
        <L>Type{t?.filingType ? ` (registration filing: ${t.filingType})` : ""}</L>
        <Input name="name" defaultValue={t?.name} />
      </label>
      <label className="w-48">
        <L>Category</L>
        <Input name="category" defaultValue={t?.category} />
      </label>
      <label className="w-60">
        <L>Default unit</L>
        <Select name="defaultUnitId" defaultValue={t?.defaultUnitId ?? ""}>
          <option value="">— none (route by hand)</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="w-28">
        <L>Order ref</L>
        <Input name="orderRef" defaultValue={t?.orderRef ?? ""} />
      </label>
      <label className="w-24">
        <L>Target (wd)</L>
        <Input name="responseTargetDays" inputMode="numeric" defaultValue={String(t?.responseTargetDays ?? 10)} className="tabular text-right" />
      </label>
      <Check name="para103Wording" label="Para 10(3) slip" checked={t?.para103Wording ?? false} />
      {t ? <Check name="active" label="Active" checked={t.active} /> : null}
    </ActionForm>
  );
}

type Meta = "code" | "channel" | "outgoing" | undefined;

function MetaFields({ meta, current, channels }: { meta: Meta; current: string | null; channels: string[] }) {
  if (meta === "code")
    return (
      <label className="w-24">
        <L>Code</L>
        <Input name="code" defaultValue={current ?? ""} className="font-mono uppercase" />
      </label>
    );
  if (meta === "channel")
    return (
      <label className="w-40">
        <L>Register channel</L>
        <Select name="channel" defaultValue={current ?? "By hand"}>
          {channels.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </label>
    );
  if (meta === "outgoing") {
    let m: { responseExpected?: boolean; responseDays?: number } = {};
    try {
      m = current ? JSON.parse(current) : {};
    } catch {
      m = {};
    }
    return (
      <>
        <Check name="responseExpected" label="Response expected" checked={!!m.responseExpected} />
        <label className="w-24">
          <L>Window (wd)</L>
          <Input name="responseDays" inputMode="numeric" defaultValue={String(m.responseDays ?? 0)} className="tabular text-right" />
        </label>
      </>
    );
  }
  return null;
}

export function ListItemRow({ listKey, item, meta, channels, locked }: { listKey: string; item: { value: string; active: boolean; meta: string | null }; meta: Meta; channels: string[]; locked: boolean }) {
  return (
    <ActionForm action={updateListItemAction} submitLabel="Save" size="sm" variant="ghost" inline hidden={{ listKey, value: item.value, activeField: "1" }}>
      <div className="min-w-48 flex-1 self-center text-sm">
        {item.value}
        {locked ? <span className="ml-2 text-xs text-faint">used by the rules</span> : null}
      </div>
      <MetaFields meta={meta} current={item.meta} channels={channels} />
      <Check name="active" label="Active" checked={item.active} />
    </ActionForm>
  );
}

export function AddListItem({ listKey, meta, channels }: { listKey: string; meta: Meta; channels: string[] }) {
  return (
    <ActionForm action={addListItemAction} submitLabel="Add" size="sm" variant="secondary" inline hidden={{ listKey }} resetOnSuccess>
      <label className="min-w-48 flex-1">
        <L>New value</L>
        <Input name="value" />
      </label>
      <MetaFields meta={meta} current={null} channels={channels} />
    </ActionForm>
  );
}
