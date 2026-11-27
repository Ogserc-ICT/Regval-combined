"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { saveSignatoryAction } from "../actions";

export type SignatoryRow = { id: string; name: string; designation: string; role: string; active: boolean; confirmed: boolean; userId: string | null };
export type StaffOption = { id: string; name: string; hasSignature: boolean };

export function SignatoryForm({
  s,
  editable,
  roles,
  staff,
}: {
  s?: SignatoryRow;
  editable: boolean;
  roles: { value: string; label: string }[];
  staff: StaffOption[];
}) {
  const key = s?.id ?? "new";
  return (
    <ActionForm action={saveSignatoryAction} submitLabel={s ? "Save" : "Add signatory"} size="sm" variant={s ? "secondary" : "primary"} hidden={s ? { id: s.id } : undefined} resetOnSuccess={!s}>
      {(fe) => (
        <fieldset disabled={!editable} className="grid gap-3 md:grid-cols-[1fr_1fr_14rem]">
          <Field label="Full name" htmlFor={`name-${key}`} errors={fe.name}>
            <Input id={`name-${key}`} name="name" defaultValue={s?.name} />
          </Field>
          <Field label="Designation (printed)" htmlFor={`des-${key}`} errors={fe.designation}>
            <Input id={`des-${key}`} name="designation" defaultValue={s?.designation} />
          </Field>
          <Field label="Role" htmlFor={`role-${key}`} errors={fe.role}>
            <Select id={`role-${key}`} name="role" defaultValue={s?.role ?? "secretary"}>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Staff account for the e-signature (optional)"
            htmlFor={`user-${key}`}
            errors={fe.userId}
            hint="For a signatory who is also on the staff (e.g. the Head of Finance on payment receipts): their staff account's e-signature is used when none is uploaded below."
            className="md:col-span-3"
          >
            <Select id={`user-${key}`} name="userId" defaultValue={s?.userId ?? ""}>
              <option value="">None</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.hasSignature ? "" : " (no e-signature yet)"}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-5 md:col-span-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={s?.active ?? true} className="h-4 w-4 accent-[var(--accent)]" /> Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirmed" defaultChecked={s?.confirmed ?? true} className="h-4 w-4 accent-[var(--accent)]" /> Confirmed by admin
            </label>
          </div>
        </fieldset>
      )}
    </ActionForm>
  );
}
