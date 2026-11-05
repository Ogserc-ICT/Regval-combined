"use client";

import { useState, type ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { intakeAction } from "../_registry/actions";

export type IntakeLists = {
  modes: string[];
  ackVia: string[];
  lgas: string[];
  licenceStatuses: string[];
  activities: { code: string; name: string }[];
  forms: { form: string; title: string }[];
};

export type IntakeDefaults = {
  frontDeskItemId?: string;
  inwardItemId?: string;
  source?: string;
  receivedDate: string;
  receivedTime: string;
  mode: string;
  filingType: string;
  registeredName: string;
  subject: string;
  phone: string;
  deliveredBy: string;
  volumes: string;
  remarks: string;
  cacNo: string;
  relatedNo: string;
  ackIssuedVia: string;
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</CardBody>
    </Card>
  );
}

const Opts = ({ items, blank = "—" }: { items: string[]; blank?: string | null }) => (
  <>
    {blank !== null ? <option value="">{blank}</option> : null}
    {items.map((i) => (
      <option key={i}>{i}</option>
    ))}
  </>
);

export function IntakeForm({ lists, d }: { lists: IntakeLists; d: IntakeDefaults }) {
  const [filing, setFiling] = useState(d.filingType);
  const [operating, setOperating] = useState("");
  const pulled = !!(d.frontDeskItemId || d.inwardItemId);
  const ownUse = filing === "OWNUSE";
  const hidden: Record<string, string> = {};
  if (d.frontDeskItemId) hidden.frontDeskItemId = d.frontDeskItemId;
  if (d.inwardItemId) hidden.inwardItemId = d.inwardItemId;

  return (
    <ActionForm action={intakeAction} submitLabel={d.inwardItemId ? "Start the entry" : "Save and acknowledge"} pendingLabel="Saving…" hidden={hidden}>
      {(fe) => (
        <div className="flex flex-col gap-6">
          <Section title="Receipt" description={d.source ?? "Saving issues the ACK, logs the item in the Inward Register and starts the Register or Own-Use entry under the same ACK."}>
            <Field label="Date received *" htmlFor="receivedDate" errors={fe.receivedDate}>
              <Input id="receivedDate" name="receivedDate" type="date" defaultValue={d.receivedDate} disabled={pulled} />
            </Field>
            <Field label="Time received *" htmlFor="receivedTime" hint="Lagos time" errors={fe.receivedTime}>
              <Input id="receivedTime" name="receivedTime" type="time" defaultValue={d.receivedTime} disabled={pulled} />
            </Field>
            <Field label="Mode of receipt *" htmlFor="mode" errors={fe.mode}>
              <Select id="mode" name="mode" defaultValue={d.mode}>
                <Opts items={lists.modes} blank={null} />
              </Select>
            </Field>
            <Field label="Filing type *" htmlFor="filingType" errors={fe.filingType}>
              <Select id="filingType" name="filingType" value={filing} onChange={(e) => setFiling(e.target.value)} disabled={!!d.inwardItemId}>
                <option value="NEW">New registration</option>
                <option value="UPDATE">Update: material change (para 16(1))</option>
                <option value="ANNUAL">Annual confirmation (para 16(2))</option>
                <option value="OWNUSE">Own-use notification (REG-01I)</option>
              </Select>
              {d.inwardItemId ? <input type="hidden" name="filingType" value={filing} /> : null}
            </Field>
            {!ownUse ? (
              <Field label="Form filed *" htmlFor="formFiled" errors={fe.formFiled}>
                <Select id="formFiled" name="formFiled" defaultValue="">
                  <option value="">—</option>
                  {lists.forms
                    .filter((f) => f.form !== "REG-01I")
                    .map((f) => (
                      <option key={f.form} value={f.form}>
                        {f.form} · {f.title}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
            {filing === "UPDATE" || filing === "ANNUAL" ? (
              <Field label="Linked registration no. *" htmlFor="linkedRegistrationNo" errors={fe.linkedRegistrationNo}>
                <Input id="linkedRegistrationNo" name="linkedRegistrationNo" defaultValue={d.relatedNo} placeholder="OGSERC/REG/2026/D-GEN/0001" />
              </Field>
            ) : null}
            <Field label="Acknowledgement issued via *" htmlFor="ackIssuedVia" errors={fe.ackIssuedVia}>
              <Select id="ackIssuedVia" name="ackIssuedVia" defaultValue={d.ackIssuedVia}>
                <Opts items={lists.ackVia} blank={null} />
              </Select>
            </Field>
          </Section>

          <Section title={ownUse ? "Notifier" : "Registrant"}>
            <Field label={ownUse ? "Name *" : "Registered name *"} htmlFor="registeredName" errors={fe.registeredName} className="md:col-span-2">
              <Input id="registeredName" name="registeredName" defaultValue={d.registeredName} />
            </Field>
            <Field label="CAC no." htmlFor="cacNo" errors={fe.cacNo}>
              <Input id="cacNo" name="cacNo" defaultValue={d.cacNo} />
            </Field>
            <Field label="Subject" htmlFor="subject" hint="Blank = the filing type and form" className="md:col-span-2">
              <Input id="subject" name="subject" defaultValue={d.subject} />
            </Field>
            <Field label="Sender's ref" htmlFor="senderRef">
              <Input id="senderRef" name="senderRef" />
            </Field>
            <Field label={ownUse ? "Site address" : "Registered address"} htmlFor="registeredAddress" className="md:col-span-2">
              <Input id="registeredAddress" name="registeredAddress" />
            </Field>
            <Field label="Principal LGA *" htmlFor="principalLga" errors={fe.principalLga}>
              <Select id="principalLga" name="principalLga" defaultValue="">
                <Opts items={lists.lgas} />
              </Select>
            </Field>
            {!ownUse ? (
              <>
                <Field label="Primary activity" htmlFor="primaryActivity" errors={fe.primaryActivity}>
                  <Select id="primaryActivity" name="primaryActivity" defaultValue="">
                    <option value="">—</option>
                    {lists.activities.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.name} ({a.code})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Licence status" htmlFor="licenceStatus" errors={fe.licenceStatus}>
                  <Select id="licenceStatus" name="licenceStatus" defaultValue="">
                    <Opts items={lists.licenceStatuses} />
                  </Select>
                </Field>
                <Field label="Operating on the Effective Date?" htmlFor="operatingOnEffectiveDate" hint="With activity and licence status, the entry is saved at once." errors={fe.operatingOnEffectiveDate}>
                  <Select id="operatingOnEffectiveDate" name="operatingOnEffectiveDate" value={operating} onChange={(e) => setOperating(e.target.value)}>
                    <option value="">—</option>
                    <option value="Y">Y</option>
                    <option value="N">N</option>
                  </Select>
                </Field>
                {operating === "N" ? (
                  <Field label="Planned start date" htmlFor="plannedStartDate" errors={fe.plannedStartDate}>
                    <Input id="plannedStartDate" name="plannedStartDate" type="date" />
                  </Field>
                ) : null}
              </>
            ) : null}
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

          <Section title="What came with it" description="Registry Intake does not record payments or start evaluation; Finance and the evaluators take it from the Register.">
            <Field label="Delivered by" htmlFor="deliveredBy">
              <Input id="deliveredBy" name="deliveredBy" defaultValue={d.deliveredBy} />
            </Field>
            <Field label="Volumes" htmlFor="volumes" errors={fe.volumes}>
              <Input id="volumes" name="volumes" inputMode="numeric" defaultValue={d.volumes} />
            </Field>
            <Field label="Schedule 2 documents attached" htmlFor="schedule2Count" errors={fe.schedule2Count}>
              <Input id="schedule2Count" name="schedule2Count" inputMode="numeric" />
            </Field>
            <Field label="Fee evidence?" htmlFor="feeEvidence">
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
