"use client";

import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { saveInwardAction } from "../_registry/actions";

export type InwardFormLists = {
  types: { id: string; name: string; unit: string | null }[];
  modes: string[];
  senderCategories: string[];
  ackVia: string[];
  lgas: string[];
};

export type InwardDefaults = {
  frontDeskItemId?: string;
  fdNo?: string;
  receivedDate: string;
  receivedTime: string;
  mode: string;
  correspondenceTypeId: string;
  sender: string;
  subject: string;
  deliveredBy: string;
  phone: string;
  volumes: string;
  remarks: string;
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</CardBody>
    </Card>
  );
}

function Opts({ items, blank = "—" }: { items: string[]; blank?: string | null }) {
  return (
    <>
      {blank !== null ? <option value="">{blank}</option> : null}
      {items.map((i) => (
        <option key={i}>{i}</option>
      ))}
    </>
  );
}

export function InwardForm({ lists, d }: { lists: InwardFormLists; d: InwardDefaults }) {
  const fromFd = !!d.frontDeskItemId;
  return (
    <ActionForm action={saveInwardAction} submitLabel="Save and issue ACK" pendingLabel="Saving…" hidden={d.frontDeskItemId ? { frontDeskItemId: d.frontDeskItemId } : undefined}>
      {(fe) => (
        <div className="flex flex-col gap-6">
          <Section
            title="Receipt"
            description={fromFd ? `From ${d.fdNo}: the front-desk time is the receipt time.` : "The deemed receipt date (para 10(3)) is worked out on save and sets the ACK year."}
          >
            <Field label="Date received *" htmlFor="receivedDate" errors={fe.receivedDate}>
              <Input id="receivedDate" name="receivedDate" type="date" defaultValue={d.receivedDate} disabled={fromFd} />
            </Field>
            <Field label="Time received *" htmlFor="receivedTime" hint="Lagos time" errors={fe.receivedTime}>
              <Input id="receivedTime" name="receivedTime" type="time" defaultValue={d.receivedTime} disabled={fromFd} />
            </Field>
            <Field label="Mode of receipt *" htmlFor="mode" hint="Email and portal items after closing time are received the next working day." errors={fe.mode}>
              <Select id="mode" name="mode" defaultValue={d.mode}>
                <Opts items={lists.modes} blank={null} />
              </Select>
            </Field>
            <Field label="Correspondence type *" htmlFor="correspondenceTypeId" errors={fe.correspondenceTypeId} className="md:col-span-2">
              <Select id="correspondenceTypeId" name="correspondenceTypeId" defaultValue={d.correspondenceTypeId}>
                <option value="">—</option>
                {lists.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.unit ? ` → ${t.unit}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Acknowledgement issued via *" htmlFor="ackIssuedVia" errors={fe.ackIssuedVia}>
              <Select id="ackIssuedVia" name="ackIssuedVia" defaultValue="Printed slip">
                <Opts items={lists.ackVia} blank={null} />
              </Select>
            </Field>
          </Section>

          <Section title="Sender">
            <Field label="Sender *" htmlFor="sender" errors={fe.sender} className="md:col-span-2">
              <Input id="sender" name="sender" defaultValue={d.sender} />
            </Field>
            <Field label="Sender category *" htmlFor="senderCategory" errors={fe.senderCategory}>
              <Select id="senderCategory" name="senderCategory" defaultValue="">
                <Opts items={lists.senderCategories} />
              </Select>
            </Field>
            <Field label="Subject *" htmlFor="subject" errors={fe.subject} className="md:col-span-2">
              <Input id="subject" name="subject" defaultValue={d.subject} />
            </Field>
            <Field label="Sender's ref" htmlFor="senderRef">
              <Input id="senderRef" name="senderRef" />
            </Field>
            <Field label="Date on document" htmlFor="documentDate" errors={fe.documentDate}>
              <Input id="documentDate" name="documentDate" type="date" />
            </Field>
            <Field label="Related OGSERC no." htmlFor="relatedOgsercNo" hint="Registration or ACK number this concerns">
              <Input id="relatedOgsercNo" name="relatedOgsercNo" />
            </Field>
            <Field label="In response to our ref" htmlFor="inResponseToOutNo" hint="An OGSERC/OUT number" errors={fe.inResponseToOutNo}>
              <Input id="inResponseToOutNo" name="inResponseToOutNo" placeholder="OGSERC/OUT/2026/00001" />
            </Field>
            <Field label="CAC / reg no." htmlFor="cacNo">
              <Input id="cacNo" name="cacNo" />
            </Field>
            <Field label="Principal LGA" htmlFor="lga" errors={fe.lga}>
              <Select id="lga" name="lga" defaultValue="">
                <Opts items={lists.lgas} />
              </Select>
            </Field>
            <Field label="Contact person" htmlFor="contactPerson">
              <Input id="contactPerson" name="contactPerson" />
            </Field>
            <Field label="Phone" htmlFor="phone" hint="11 digits starting with 0, or +234 and 10 digits" errors={fe.phone}>
              <Input id="phone" name="phone" inputMode="tel" defaultValue={d.phone} />
            </Field>
            <Field label="Email" htmlFor="email" errors={fe.email}>
              <Input id="email" name="email" type="email" />
            </Field>
          </Section>

          <Section title="Contents" description="For registration filings: what came with it.">
            <Field label="Delivered / sent by" htmlFor="deliveredBy">
              <Input id="deliveredBy" name="deliveredBy" defaultValue={d.deliveredBy} />
            </Field>
            <Field label="Number of items / volumes" htmlFor="volumes" errors={fe.volumes}>
              <Input id="volumes" name="volumes" inputMode="numeric" defaultValue={d.volumes} />
            </Field>
            <Field label="Schedule 2 documents attached" htmlFor="schedule2Count" errors={fe.schedule2Count}>
              <Input id="schedule2Count" name="schedule2Count" inputMode="numeric" />
            </Field>
            <Field label="Fee evidence attached?" htmlFor="feeEvidence">
              <Select id="feeEvidence" name="feeEvidence" defaultValue="">
                <option value="">—</option>
                <option value="Y">Y</option>
                <option value="N">N</option>
              </Select>
            </Field>
            <Field label="Payment reference" htmlFor="paymentReference">
              <Input id="paymentReference" name="paymentReference" />
            </Field>
            <Field label="Amount shown (₦)" htmlFor="amountShown" errors={fe.amountShown}>
              <Input id="amountShown" name="amountShown" inputMode="decimal" />
            </Field>
            <Field label="Remarks" htmlFor="remarks" className="md:col-span-2 xl:col-span-3">
              <Textarea id="remarks" name="remarks" defaultValue={d.remarks} />
            </Field>
          </Section>
        </div>
      )}
    </ActionForm>
  );
}
