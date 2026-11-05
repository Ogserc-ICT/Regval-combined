"use client";

import { ActionForm } from "@/components/action-form";
import { Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { deliverOutwardAction, dispatchOutwardAction, saveOutwardAction, updateOutwardAction } from "../_registry/actions";

export type OutwardLists = {
  docTypes: { name: string; responseExpected: boolean; responseDays: number }[];
  categories: string[];
  units: { id: string; name: string }[];
  signatories: { id: string; name: string; designation: string; isSecretary: boolean }[];
  modes: string[];
};

const Opts = ({ items, blank = "—" }: { items: string[]; blank?: string | null }) => (
  <>
    {blank !== null ? <option value="">{blank}</option> : null}
    {items.map((i) => (
      <option key={i}>{i}</option>
    ))}
  </>
);

export function OutwardForm({ lists, today, replyTo }: { lists: OutwardLists; today: string; replyTo: { ack: string; sender: string; subject: string } | null }) {
  const secretary = lists.signatories.find((s) => s.isSecretary)?.id ?? "";
  return (
    <ActionForm action={saveOutwardAction} submitLabel="Save and get number" pendingLabel="Saving…">
      {(fe) => (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Document" description="The OUT number is issued now, before signature." />
            <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Date of document *" htmlFor="documentDate" errors={fe.documentDate}>
                <Input id="documentDate" name="documentDate" type="date" defaultValue={today} />
              </Field>
              <Field label="Document type *" htmlFor="documentType" errors={fe.documentType} className="md:col-span-2">
                <Select id="documentType" name="documentType" defaultValue={replyTo ? "Reply to correspondence" : ""}>
                  <option value="">—</option>
                  {lists.docTypes.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                      {d.responseExpected ? ` (response in ${d.responseDays || "default"} working days)` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Subject *" htmlFor="subject" errors={fe.subject} className="md:col-span-2 xl:col-span-3">
                <Input id="subject" name="subject" defaultValue={replyTo ? `Re: ${replyTo.subject}` : ""} />
              </Field>
              <Field label="Addressee *" htmlFor="addressee" errors={fe.addressee} className="md:col-span-2">
                <Input id="addressee" name="addressee" defaultValue={replyTo?.sender ?? ""} />
              </Field>
              <Field label="Recipient category *" htmlFor="recipientCategory" errors={fe.recipientCategory}>
                <Select id="recipientCategory" name="recipientCategory" defaultValue="">
                  <Opts items={lists.categories} />
                </Select>
              </Field>
              <Field label="Recipient address / email" htmlFor="recipientContact" className="md:col-span-2 xl:col-span-3">
                <Input id="recipientContact" name="recipientContact" />
              </Field>
              <Field label="In reply to (inward ACK)" htmlFor="inReplyToAck" hint={replyTo ? `From ${replyTo.sender}` : "Closes that item when dispatched"} errors={fe.inReplyToAck}>
                <Input id="inReplyToAck" name="inReplyToAck" defaultValue={replyTo?.ack ?? ""} placeholder="OGSERC/ACK/2026/00001" />
              </Field>
              <Field label="Related OGSERC no." htmlFor="relatedOgsercNo">
                <Input id="relatedOgsercNo" name="relatedOgsercNo" />
              </Field>
              <Field label="File reference" htmlFor="fileRef" errors={fe.fileRef}>
                <Input id="fileRef" name="fileRef" placeholder="OGSERC/REG/001" />
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Signature and dispatch" />
            <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Originating unit *" htmlFor="originatingUnitId" errors={fe.originatingUnitId}>
                <Select id="originatingUnitId" name="originatingUnitId" defaultValue="">
                  <option value="">—</option>
                  {lists.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prepared by" htmlFor="preparedBy">
                <Input id="preparedBy" name="preparedBy" />
              </Field>
              <Field label="Signed by *" htmlFor="signatoryId" hint={lists.signatories.length ? undefined : "No active signatories. An admin adds them under Admin › Signatories."} errors={fe.signatoryId}>
                <Select id="signatoryId" name="signatoryId" defaultValue={secretary}>
                  <option value="">—</option>
                  {lists.signatories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}, {s.designation}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Dispatch mode *" htmlFor="dispatchMode" errors={fe.dispatchMode}>
                <Select id="dispatchMode" name="dispatchMode" defaultValue="Hand delivery">
                  <Opts items={lists.modes} blank={null} />
                </Select>
              </Field>
              <Field label="Date dispatched" htmlFor="dispatchedOn" hint="Leave blank until it goes out" errors={fe.dispatchedOn}>
                <Input id="dispatchedOn" name="dispatchedOn" type="date" />
              </Field>
              <Field label="Tracking ref" htmlFor="trackingRef">
                <Input id="trackingRef" name="trackingRef" />
              </Field>
              <Field label="Response expected?" htmlFor="responseExpected" hint="Blank = the document type's default" errors={fe.responseExpected}>
                <Select id="responseExpected" name="responseExpected" defaultValue="">
                  <option value="">Type default</option>
                  <option value="Y">Y</option>
                  <option value="N">N</option>
                </Select>
              </Field>
              <Field label="Response due (override)" htmlFor="responseDueOverride" errors={fe.responseDueOverride}>
                <Input id="responseDueOverride" name="responseDueOverride" type="date" />
              </Field>
              <Field label="Remarks" htmlFor="remarks" className="md:col-span-2 xl:col-span-3">
                <Textarea id="remarks" name="remarks" />
              </Field>
            </CardBody>
          </Card>
        </div>
      )}
    </ActionForm>
  );
}

export function DispatchForm({ id, today, trackingRef }: { id: string; today: string; trackingRef: string }) {
  return (
    <ActionForm action={dispatchOutwardAction} submitLabel="Record dispatch" size="sm" hidden={{ id }}>
      {(fe) => (
        <>
          <Field label="Date dispatched" htmlFor="dispDate" errors={fe.date}>
            <Input id="dispDate" name="date" type="date" defaultValue={today} />
          </Field>
          <Field label="Tracking ref" htmlFor="dispTracking">
            <Input id="dispTracking" name="trackingRef" defaultValue={trackingRef} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function DeliverForm({ id, today }: { id: string; today: string }) {
  return (
    <ActionForm action={deliverOutwardAction} submitLabel="Confirm delivery" size="sm" variant="secondary" hidden={{ id }}>
      {(fe) => (
        <>
          <Field label="Date delivered" htmlFor="delDate" errors={fe.date}>
            <Input id="delDate" name="date" type="date" defaultValue={today} />
          </Field>
          <Field label="Received by (recipient)" htmlFor="delBy">
            <Input id="delBy" name="receivedBy" />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function UpdateOutwardForm({
  id,
  v,
}: {
  id: string;
  v: { recipientContact: string; fileRef: string; trackingRef: string; responseExpected: string; responseDueOverride: string; remarks: string };
}) {
  return (
    <ActionForm action={updateOutwardAction} submitLabel="Save changes" size="sm" hidden={{ id }}>
      {(fe) => (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Recipient address / email" htmlFor="o_contact" className="md:col-span-2">
            <Input id="o_contact" name="recipientContact" defaultValue={v.recipientContact} />
          </Field>
          <Field label="File reference" htmlFor="o_file" errors={fe.fileRef}>
            <Input id="o_file" name="fileRef" defaultValue={v.fileRef} />
          </Field>
          <Field label="Tracking ref" htmlFor="o_tracking">
            <Input id="o_tracking" name="trackingRef" defaultValue={v.trackingRef} />
          </Field>
          <Field label="Response expected?" htmlFor="o_re" errors={fe.responseExpected}>
            <Select id="o_re" name="responseExpected" defaultValue={v.responseExpected}>
              <option value="">Type default</option>
              <option value="Y">Y</option>
              <option value="N">N</option>
            </Select>
          </Field>
          <Field label="Response due (override)" htmlFor="o_due" errors={fe.responseDueOverride}>
            <Input id="o_due" name="responseDueOverride" type="date" defaultValue={v.responseDueOverride} />
          </Field>
          <Field label="Remarks" htmlFor="o_remarks" className="md:col-span-2">
            <Textarea id="o_remarks" name="remarks" defaultValue={v.remarks} />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}
