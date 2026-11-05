"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { issueFileAction, openFileAction, returnFileAction, updateFileAction } from "../_registry/actions";

type Unit = { id: string; name: string };

export function NewFileForm({ classes, units, security, today }: { classes: { name: string; code: string; next: string }[]; units: Unit[]; security: string[]; today: string }) {
  return (
    <ActionForm action={openFileAction} submitLabel="Open the file" pendingLabel="Saving…">
      {(fe) => (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="File class *" htmlFor="fileClass" errors={fe.fileClass}>
            <Select id="fileClass" name="fileClass" defaultValue="">
              <option value="">—</option>
              {classes.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.code}) · next {c.next}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="File reference" htmlFor="fileRef" hint="Blank = the next number for the class. Type one to overtype it (must be unique)." errors={fe.fileRef}>
            <Input id="fileRef" name="fileRef" placeholder="OGSERC/REG/001" />
          </Field>
          <Field label="Title *" htmlFor="title" errors={fe.title} className="md:col-span-2">
            <Input id="title" name="title" />
          </Field>
          <Field label="Owning unit" htmlFor="owningUnitId" errors={fe.owningUnitId}>
            <Select id="owningUnitId" name="owningUnitId" defaultValue="">
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date opened" htmlFor="openedOn" errors={fe.openedOn}>
            <Input id="openedOn" name="openedOn" type="date" defaultValue={today} />
          </Field>
          <Field label="Volume" htmlFor="currentVolume" errors={fe.currentVolume}>
            <Input id="currentVolume" name="currentVolume" inputMode="numeric" defaultValue="1" />
          </Field>
          <Field label="Security" htmlFor="security" errors={fe.security}>
            <Select id="security" name="security" defaultValue="Open">
              {security.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Remarks" htmlFor="remarks" className="md:col-span-2">
            <Textarea id="remarks" name="remarks" />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

export function IssueFileForm({ fileId, units, volume }: { fileId: string; units: Unit[]; volume: number }) {
  return (
    <ActionForm action={issueFileAction} submitLabel="Issue" size="sm" hidden={{ fileId }}>
      {(fe) => (
        <>
          <Field label="Issued to (officer) *" htmlFor="issuedTo" errors={fe.issuedTo}>
            <Input id="issuedTo" name="issuedTo" />
          </Field>
          <Field label="Unit *" htmlFor="unitId" errors={fe.unitId}>
            <Select id="unitId" name="unitId" defaultValue="">
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Volume" htmlFor="volume" errors={fe.volume}>
            <Input id="volume" name="volume" inputMode="numeric" defaultValue={String(volume)} />
          </Field>
          <Field label="Purpose" htmlFor="purpose">
            <Input id="purpose" name="purpose" />
          </Field>
          <Field label="Return by (override)" htmlFor="returnByOverride" errors={fe.returnByOverride}>
            <Input id="returnByOverride" name="returnByOverride" type="date" />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function ReturnFileForm({ fileId, holder }: { fileId: string; holder: string }) {
  return <ActionForm action={returnFileAction} submitLabel={`Returned by ${holder}`} size="sm" variant="secondary" hidden={{ fileId }} />;
}

export function UpdateFileForm({
  id,
  v,
  units,
  security,
  statuses,
}: {
  id: string;
  v: { title: string; owningUnitId: string; currentVolume: string; security: string; status: string; remarks: string };
  units: Unit[];
  security: string[];
  statuses: string[];
}) {
  return (
    <ActionForm action={updateFileAction} submitLabel="Save changes" size="sm" hidden={{ id }}>
      {(fe) => (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title *" htmlFor="f_title" errors={fe.title} className="md:col-span-2">
            <Input id="f_title" name="title" defaultValue={v.title} />
          </Field>
          <Field label="Owning unit" htmlFor="f_unit" errors={fe.owningUnitId}>
            <Select id="f_unit" name="owningUnitId" defaultValue={v.owningUnitId}>
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Current volume" htmlFor="f_vol" errors={fe.currentVolume}>
            <Input id="f_vol" name="currentVolume" inputMode="numeric" defaultValue={v.currentVolume} />
          </Field>
          <Field label="Security" htmlFor="f_sec" errors={fe.security}>
            <Select id="f_sec" name="security" defaultValue={v.security}>
              {security.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="f_status" hint="Closing sets the closed date to today." errors={fe.status}>
            <Select id="f_status" name="status" defaultValue={v.status}>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Remarks" htmlFor="f_remarks" className="md:col-span-2">
            <Textarea id="f_remarks" name="remarks" defaultValue={v.remarks} />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}
