"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { recordPaymentAction } from "@/app/(app)/register/actions";

/** Record a payment against an ACK or OUN. It stays Pending until Finance confirms it. */
export function RecordPaymentForm({
  reference,
  today,
  channels,
  purposes,
  revalidateId = "",
}: {
  reference?: string;
  today: string;
  channels: string[];
  purposes: string[];
  revalidateId?: string;
}) {
  return (
    <ActionForm action={recordPaymentAction} submitLabel="Record payment" hidden={{ id: revalidateId, ...(reference ? { reference } : {}) }} resetOnSuccess>
      {(fe) => (
        <div className="grid gap-4 md:grid-cols-3">
          {!reference ? (
            <Field label="Reference (ACK or OUN) *" htmlFor="reference" errors={fe.reference}>
              <Input id="reference" name="reference" placeholder="OGSERC/ACK/2026/00001" />
            </Field>
          ) : null}
          <Field label="Date received *" htmlFor="dateReceived" errors={fe.dateReceived}>
            <Input id="dateReceived" name="dateReceived" type="date" defaultValue={today} />
          </Field>
          <Field label="Amount (₦) *" htmlFor="amount" errors={fe.amount}>
            <Input id="amount" name="amount" inputMode="decimal" placeholder="300,000" />
          </Field>
          <Field label="Purpose" htmlFor="purpose" errors={fe.purpose}>
            <Select id="purpose" name="purpose" defaultValue={purposes[0]}>
              {purposes.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Channel" htmlFor="channel" errors={fe.channel}>
            <Select id="channel" name="channel" defaultValue={channels[0]}>
              {channels.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="RRR / bank reference" htmlFor="rrr">
            <Input id="rrr" name="rrr" autoComplete="off" />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}
