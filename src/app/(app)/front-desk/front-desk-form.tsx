"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { logFrontDeskAction } from "../_registry/actions";

export function FrontDeskForm({ types, modes, today, now }: { types: { id: string; name: string }[]; modes: string[]; today: string; now: string }) {
  return (
    <ActionForm action={logFrontDeskAction} submitLabel="Log it" pendingLabel="Saving…" resetOnSuccess>
      {(fe) => (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Date received *" htmlFor="receivedDate" errors={fe.receivedDate}>
            <Input id="receivedDate" name="receivedDate" type="date" defaultValue={today} />
          </Field>
          <Field label="Time received *" htmlFor="receivedTime" hint="Lagos time" errors={fe.receivedTime}>
            <Input id="receivedTime" name="receivedTime" type="time" defaultValue={now} />
          </Field>
          <Field label="Sender *" htmlFor="sender" errors={fe.sender} className="md:col-span-2">
            <Input id="sender" name="sender" />
          </Field>
          <Field label="Subject *" htmlFor="subject" errors={fe.subject} className="md:col-span-2">
            <Input id="subject" name="subject" />
          </Field>
          <Field label="Correspondence type (if known)" htmlFor="correspondenceTypeId" errors={fe.correspondenceTypeId}>
            <Select id="correspondenceTypeId" name="correspondenceTypeId" defaultValue="">
              <option value="">Not sure</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mode of receipt" htmlFor="mode" errors={fe.mode}>
            <Select id="mode" name="mode" defaultValue="Hand delivery">
              {modes.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Delivered by" htmlFor="deliveredBy">
            <Input id="deliveredBy" name="deliveredBy" />
          </Field>
          <Field label="Phone" htmlFor="phone" hint="11 digits starting with 0, or +234 and 10 digits" errors={fe.phone}>
            <Input id="phone" name="phone" inputMode="tel" />
          </Field>
          <Field label="Number of items / volumes" htmlFor="volumes" errors={fe.volumes}>
            <Input id="volumes" name="volumes" inputMode="numeric" />
          </Field>
          <Field label="Remarks" htmlFor="remarks" className="md:col-span-2">
            <Textarea id="remarks" name="remarks" />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}
