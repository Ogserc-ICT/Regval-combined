"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import {
  closeInwardAction,
  confirmReceiptAction,
  discardEmailAction,
  forwardInwardAction,
  resendAckAction,
  routeInwardAction,
  sendEmailAction,
  updateInwardAction,
} from "../../_registry/actions";

const Opts = ({ items, blank = "—" }: { items: string[]; blank?: string | null }) => (
  <>
    {blank !== null ? <option value="">{blank}</option> : null}
    {items.map((i) => (
      <option key={i}>{i}</option>
    ))}
  </>
);

export function RouteForm({
  id,
  units,
  actions,
  priorities,
  current,
}: {
  id: string;
  units: { id: string; name: string }[];
  actions: string[];
  priorities: string[];
  current: { unitId: string; defaultUnit: string | null; fileRef: string; actionRequired: string; priority: string; actionOfficer: string; responseDueOverride: string };
}) {
  return (
    <ActionForm action={routeInwardAction} submitLabel={current.actionRequired ? "Re-route" : "Route"} size="sm" hidden={{ id }}>
      {(fe) => (
        <>
          <Field label="Unit" htmlFor="unitId" hint={current.defaultUnit ? `Blank = the type's default: ${current.defaultUnit}` : "Blank = the type's default unit"} errors={fe.unitId}>
            <Select id="unitId" name="unitId" defaultValue={current.unitId}>
              <option value="">Type default</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Action required *" htmlFor="actionRequired" errors={fe.actionRequired}>
            <Select id="actionRequired" name="actionRequired" defaultValue={current.actionRequired}>
              <Opts items={actions} />
            </Select>
          </Field>
          <Field label="Priority" htmlFor="priority" hint="Blank = Normal" errors={fe.priority}>
            <Select id="priority" name="priority" defaultValue={current.priority}>
              <Opts items={priorities} />
            </Select>
          </Field>
          <Field label="Action officer" htmlFor="actionOfficer">
            <Input id="actionOfficer" name="actionOfficer" defaultValue={current.actionOfficer} />
          </Field>
          <Field label="File reference" htmlFor="fileRef" hint="Must be in the File Index" errors={fe.fileRef}>
            <Input id="fileRef" name="fileRef" defaultValue={current.fileRef} placeholder="OGSERC/REG/001" />
          </Field>
          <Field label="Response due (override)" htmlFor="responseDueOverride" errors={fe.responseDueOverride}>
            <Input id="responseDueOverride" name="responseDueOverride" type="date" defaultValue={current.responseDueOverride} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function ForwardForm({ id, today, officer }: { id: string; today: string; officer: string }) {
  return (
    <ActionForm action={forwardInwardAction} submitLabel="Record forwarding" size="sm" variant="secondary" hidden={{ id }}>
      {(fe) => (
        <>
          <Field label="Date forwarded" htmlFor="fwdDate" errors={fe.date}>
            <Input id="fwdDate" name="date" type="date" defaultValue={today} />
          </Field>
          <Field label="Receiving unit officer" htmlFor="unitOfficer">
            <Input id="unitOfficer" name="unitOfficer" defaultValue={officer} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function ConfirmReceiptForm({ id }: { id: string }) {
  return <ActionForm action={confirmReceiptAction} submitLabel="Confirm receipt by my unit" size="sm" variant="secondary" hidden={{ id }} />;
}

export function CloseForm({ id }: { id: string }) {
  return <ActionForm action={closeInwardAction} submitLabel="Close without a letter" size="sm" variant="secondary" hidden={{ id }} />;
}

export type InwardEditValues = {
  sender: string;
  senderCategory: string;
  senderRef: string;
  documentDate: string;
  subject: string;
  relatedOgsercNo: string;
  cacNo: string;
  lga: string;
  contactPerson: string;
  phone: string;
  email: string;
  deliveredBy: string;
  volumes: string;
  ackIssuedVia: string;
  forwardedOn: string;
  unitOfficerReceivedBy: string;
  closedManualOn: string;
  remarks: string;
};

export function UpdateInwardForm({ id, v, lists }: { id: string; v: InwardEditValues; lists: { senderCategories: string[]; ackVia: string[]; lgas: string[] } }) {
  const text = (name: keyof InwardEditValues, label: string, fe: Record<string, string[]>, type = "text", className?: string) => (
    <Field label={label} htmlFor={`u_${name}`} errors={fe[name]} className={className}>
      <Input id={`u_${name}`} name={name} type={type} defaultValue={v[name]} />
    </Field>
  );
  return (
    <ActionForm action={updateInwardAction} submitLabel="Save changes" size="sm" hidden={{ id }}>
      {(fe) => (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {text("sender", "Sender *", fe, "text", "md:col-span-2")}
          <Field label="Sender category *" htmlFor="u_senderCategory" errors={fe.senderCategory}>
            <Select id="u_senderCategory" name="senderCategory" defaultValue={v.senderCategory}>
              <Opts items={lists.senderCategories} />
            </Select>
          </Field>
          {text("subject", "Subject *", fe, "text", "md:col-span-2")}
          {text("senderRef", "Sender's ref", fe)}
          {text("documentDate", "Date on document", fe, "date")}
          {text("relatedOgsercNo", "Related OGSERC no.", fe)}
          {text("cacNo", "CAC / reg no.", fe)}
          <Field label="LGA" htmlFor="u_lga" errors={fe.lga}>
            <Select id="u_lga" name="lga" defaultValue={v.lga}>
              <Opts items={lists.lgas} />
            </Select>
          </Field>
          {text("contactPerson", "Contact person", fe)}
          {text("phone", "Phone", fe)}
          {text("email", "Email", fe)}
          {text("deliveredBy", "Delivered by", fe)}
          {text("volumes", "Volumes", fe)}
          <Field label="Acknowledgement issued via" htmlFor="u_ackIssuedVia" errors={fe.ackIssuedVia}>
            <Select id="u_ackIssuedVia" name="ackIssuedVia" defaultValue={v.ackIssuedVia}>
              <Opts items={lists.ackVia} blank={null} />
            </Select>
          </Field>
          {text("forwardedOn", "Date forwarded", fe, "date")}
          {text("unitOfficerReceivedBy", "Receiving unit officer", fe)}
          {text("closedManualOn", "Closed on (manual)", fe, "date")}
          <Field label="Remarks" htmlFor="u_remarks" className="md:col-span-2 xl:col-span-3">
            <Textarea id="u_remarks" name="remarks" defaultValue={v.remarks} />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

export function SendEmailForm({ id, messageId, label }: { id: string; messageId: string; label: string }) {
  return <ActionForm action={sendEmailAction} submitLabel={label} size="sm" inline hidden={{ id, messageId }} />;
}

export function DiscardEmailForm({ id, messageId }: { id: string; messageId: string }) {
  return <ActionForm action={discardEmailAction} submitLabel="Discard" size="sm" variant="ghost" inline hidden={{ id, messageId }} />;
}

export function ResendAckForm({ id }: { id: string }) {
  return <ActionForm action={resendAckAction} submitLabel="Email the acknowledgement again" size="sm" variant="secondary" hidden={{ id }} />;
}
