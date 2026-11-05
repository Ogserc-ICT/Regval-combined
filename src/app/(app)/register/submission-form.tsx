"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ActionForm, type FormAction } from "@/components/action-form";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";

export type SubmissionFormLists = {
  lga: string[];
  registrantType: string[];
  licenceStatus: string[];
  channel: string[];
  activities: { code: string; name: string }[];
  forms: { form: string; title: string; category: string }[];
  categories: string[];
  conditions: { key: string; question: string }[];
};

export type SubmissionFormValues = {
  id?: string;
  filingType: string;
  formFiled: string;
  linkedRegistrationNo: string;
  registeredName: string;
  tradingName: string;
  dateSubmitted: string;
  submissionChannel: string;
  registrantType: string;
  cacNo: string;
  tin: string;
  registeredAddress: string;
  principalLga: string;
  otherLgas: string;
  townsEstates: string;
  primaryActivity: string;
  otherActivities: string[];
  installedCapacityMw: string;
  customers: string;
  licenceStatus: string;
  licences: { licenceNo: string; expiryDate: string }[];
  complianceOfficer: string;
  phone: string;
  email: string;
  operatingOnEffectiveDate: string;
  plannedStartDate: string;
  approvedWaiver: string;
  categoryOverride: string;
  overrideReason: string;
  conditions: Record<string, string>;
  formSectionsNotComplete: string;
  capacityInSectionsMw: string;
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

function Options({ items, blank = "—" }: { items: string[] | { value: string; label: string }[]; blank?: string | null }) {
  return (
    <>
      {blank !== null ? <option value="">{blank}</option> : null}
      {items.map((i) =>
        typeof i === "string" ? (
          <option key={i} value={i}>
            {i}
          </option>
        ) : (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ),
      )}
    </>
  );
}

export function SubmissionForm<T>({
  action,
  lists,
  values,
  mode,
}: {
  action: FormAction<T>;
  lists: SubmissionFormLists;
  values: SubmissionFormValues;
  /** draft: a Register row started by Registry Intake, saved under its existing ACK. */
  mode: "new" | "edit" | "draft";
}) {
  const locked = mode !== "new";
  const [filing, setFiling] = useState(values.filingType);
  const [operating, setOperating] = useState(values.operatingOnEffectiveDate);
  const [others, setOthers] = useState<string[]>(values.otherActivities);
  const [licences, setLicences] = useState(values.licences.length ? values.licences : [{ licenceNo: "", expiryDate: "" }]);
  const activityOptions = lists.activities.map((a) => ({ value: a.code, label: `${a.name} (${a.code})` }));

  return (
    <ActionForm action={action} submitLabel={mode === "new" ? "Save submission" : mode === "draft" ? "Save on the Register" : "Save changes"} pendingLabel="Saving…" hidden={values.id ? { id: values.id } : undefined}>
      {(fe) => {
        const err = (k: string) => fe[k];
        return (
          <div className="flex flex-col gap-6">
            <Section title="Submission" description={mode === "new" ? "Saving issues the next OGSERC/ACK number from the shared series and logs the filing in the Inward Register." : mode === "draft" ? "Started by Registry Intake under its ACK. Saving prices it and opens the payment step." : undefined}>
              <Field label="Filing type *" htmlFor="filingType" errors={err("filingType")}>
                <Select id="filingType" name="filingType" value={filing} onChange={(e) => setFiling(e.target.value)} disabled={locked}>
                  <option value="NEW">New registration</option>
                  <option value="UPDATE">Update: material change (para 16(1))</option>
                  <option value="ANNUAL">Annual confirmation (para 16(2))</option>
                </Select>
                {locked ? <input type="hidden" name="filingType" value={filing} /> : null}
              </Field>
              <Field label="Form filed *" htmlFor="formFiled" errors={err("formFiled")}>
                <Select id="formFiled" name="formFiled" defaultValue={values.formFiled}>
                  <Options items={lists.forms.filter((f) => f.form !== "REG-01I").map((f) => ({ value: f.form, label: `${f.form} · ${f.title}` }))} />
                </Select>
              </Field>
              {filing !== "NEW" ? (
                <Field label="Linked registration no. *" htmlFor="linkedRegistrationNo" hint="The OGSERC registration number this filing is for." errors={err("linkedRegistrationNo")}>
                  <Input id="linkedRegistrationNo" name="linkedRegistrationNo" defaultValue={values.linkedRegistrationNo} placeholder="OGSERC/REG/2026/D-GEN/0001" />
                </Field>
              ) : null}
              <Field label="Date submitted *" htmlFor="dateSubmitted" hint="Its deemed receipt date sets the ACK year and the days late." errors={err("dateSubmitted")}>
                <Input id="dateSubmitted" name="dateSubmitted" type="date" defaultValue={values.dateSubmitted} disabled={locked} />
                {locked ? <input type="hidden" name="dateSubmitted" value={values.dateSubmitted} /> : null}
              </Field>
              <Field label="Submission channel" htmlFor="submissionChannel" errors={err("submissionChannel")}>
                <Select id="submissionChannel" name="submissionChannel" defaultValue={values.submissionChannel}>
                  <Options items={lists.channel} />
                </Select>
              </Field>
            </Section>

            <Section title="Identity and service area">
              <Field label="Registered name *" htmlFor="registeredName" errors={err("registeredName")} className="md:col-span-2">
                <Input id="registeredName" name="registeredName" defaultValue={values.registeredName} />
              </Field>
              <Field label="Trading name" htmlFor="tradingName">
                <Input id="tradingName" name="tradingName" defaultValue={values.tradingName} />
              </Field>
              <Field label="Registrant type" htmlFor="registrantType" errors={err("registrantType")}>
                <Select id="registrantType" name="registrantType" defaultValue={values.registrantType}>
                  <Options items={lists.registrantType} />
                </Select>
              </Field>
              <Field label="CAC no." htmlFor="cacNo" hint="RC, BN or IT followed by digits" errors={err("cacNo")}>
                <Input id="cacNo" name="cacNo" defaultValue={values.cacNo} autoComplete="off" />
              </Field>
              <Field label="TIN" htmlFor="tin" hint="Format not yet confirmed by Finance">
                <Input id="tin" name="tin" defaultValue={values.tin} autoComplete="off" />
              </Field>
              <Field label="Registered address" htmlFor="registeredAddress" className="md:col-span-2">
                <Input id="registeredAddress" name="registeredAddress" defaultValue={values.registeredAddress} />
              </Field>
              <Field label="Principal LGA *" htmlFor="principalLga" errors={err("principalLga")}>
                <Select id="principalLga" name="principalLga" defaultValue={values.principalLga}>
                  <Options items={lists.lga} />
                </Select>
              </Field>
              <Field label="Other LGAs served" htmlFor="otherLgas">
                <Input id="otherLgas" name="otherLgas" defaultValue={values.otherLgas} />
              </Field>
              <Field label="Towns / estates served" htmlFor="townsEstates" className="md:col-span-2">
                <Input id="townsEstates" name="townsEstates" defaultValue={values.townsEstates} />
              </Field>
            </Section>

            <Section title="Activities and capacity" description="The category is the highest of all activities (A, then B, then the highest fee). One installed capacity applies to every activity.">
              <Field label="Primary activity *" htmlFor="primaryActivity" errors={err("primaryActivity")} className="md:col-span-2">
                <Select id="primaryActivity" name="primaryActivity" defaultValue={values.primaryActivity}>
                  <Options items={activityOptions} />
                </Select>
              </Field>
              <Field label="Installed capacity (MW)" htmlFor="installedCapacityMw" errors={err("installedCapacityMw")}>
                <Input id="installedCapacityMw" name="installedCapacityMw" inputMode="decimal" defaultValue={values.installedCapacityMw} />
              </Field>
              <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-3">
                <span className="text-sm font-medium">Other activities</span>
                {others.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <Select name="otherActivities" value={o} onChange={(e) => setOthers(others.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Other activity ${i + 1}`}>
                      <Options items={activityOptions} />
                    </Select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setOthers(others.filter((_, j) => j !== i))} aria-label="Remove activity">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {err("otherActivities") ? <p className="text-xs text-danger">{err("otherActivities").join(" ")}</p> : null}
                <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setOthers([...others, ""])}>
                  <Plus className="h-4 w-4" /> Add an activity
                </Button>
              </div>
              <Field label="Customers" htmlFor="customers">
                <Input id="customers" name="customers" inputMode="numeric" defaultValue={values.customers} />
              </Field>
            </Section>

            <Section title="Licences">
              <Field label="Licence status *" htmlFor="licenceStatus" errors={err("licenceStatus")} className="md:col-span-2">
                <Select id="licenceStatus" name="licenceStatus" defaultValue={values.licenceStatus}>
                  <Options items={lists.licenceStatus} />
                </Select>
              </Field>
              <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-3">
                <span className="text-sm font-medium">Licences held (number and expiry)</span>
                {licences.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_11rem_auto] gap-2">
                    <Input name="licenceNo" defaultValue={l.licenceNo} placeholder="Licence / permit number" aria-label={`Licence ${i + 1} number`} />
                    <Input name="licenceExpiry" type="date" defaultValue={l.expiryDate} aria-label={`Licence ${i + 1} expiry`} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setLicences(licences.filter((_, j) => j !== i))} aria-label="Remove licence">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {err("licences") ? <p className="text-xs text-danger">{err("licences").join(" ")}</p> : null}
                <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setLicences([...licences, { licenceNo: "", expiryDate: "" }])}>
                  <Plus className="h-4 w-4" /> Add a licence
                </Button>
              </div>
            </Section>

            <Section title="Contact">
              <Field label="Compliance officer" htmlFor="complianceOfficer">
                <Input id="complianceOfficer" name="complianceOfficer" defaultValue={values.complianceOfficer} />
              </Field>
              <Field label="Phone" htmlFor="phone" hint="11 digits starting with 0, or +234 and 10 digits" errors={err("phone")}>
                <Input id="phone" name="phone" inputMode="tel" defaultValue={values.phone} />
              </Field>
              <Field label="Email" htmlFor="email" errors={err("email")}>
                <Input id="email" name="email" type="email" defaultValue={values.email} />
              </Field>
            </Section>

            <Section title="Timeline and fees">
              <Field label="Operating on the Effective Date? *" htmlFor="operatingOnEffectiveDate" errors={err("operatingOnEffectiveDate")}>
                <Select id="operatingOnEffectiveDate" name="operatingOnEffectiveDate" value={operating} onChange={(e) => setOperating(e.target.value)}>
                  <option value="">—</option>
                  <option value="Y">Y: existing operator</option>
                  <option value="N">N: new operator</option>
                </Select>
              </Field>
              <Field label={`Planned start date${operating === "N" ? " *" : ""}`} htmlFor="plannedStartDate" hint="New operators register 30 days before they start." errors={err("plannedStartDate")}>
                <Input id="plannedStartDate" name="plannedStartDate" type="date" defaultValue={values.plannedStartDate} />
              </Field>
              <Field label="Approved waiver (₦)" htmlFor="approvedWaiver" hint="Reduces the registration fee (para 17(3))." errors={err("approvedWaiver")}>
                <Input id="approvedWaiver" name="approvedWaiver" inputMode="decimal" defaultValue={values.approvedWaiver} />
              </Field>
              <Field label="Category override" htmlFor="categoryOverride" errors={err("categoryOverride")}>
                <Select id="categoryOverride" name="categoryOverride" defaultValue={values.categoryOverride}>
                  <Options items={lists.categories} blank="(calculated)" />
                </Select>
              </Field>
              <Field label="Override reason" htmlFor="overrideReason" errors={err("overrideReason")} className="md:col-span-2">
                <Input id="overrideReason" name="overrideReason" defaultValue={values.overrideReason} />
              </Field>
            </Section>

            <Section title="Document conditions" description="Blank = applies. A document whose condition is N becomes N/A. Holding a licence follows the licence status.">
              {lists.conditions
                .filter((c) => c.key !== "holds_any_licence")
                .map((c) => (
                  <Field key={c.key} label={c.question} htmlFor={`cond_${c.key}`}>
                    <Select id={`cond_${c.key}`} name={`cond_${c.key}`} defaultValue={values.conditions[c.key] ?? ""}>
                      <option value="">(blank: applies)</option>
                      <option value="Y">Y</option>
                      <option value="N">N</option>
                    </Select>
                  </Field>
                ))}
            </Section>

            <Section title="Form sections summary" description="The detailed REG-01 sections are not held here; record what is incomplete and the capacity the sections state.">
              <Field label="Sections not complete" htmlFor="formSectionsNotComplete" className="md:col-span-2">
                <Input id="formSectionsNotComplete" name="formSectionsNotComplete" defaultValue={values.formSectionsNotComplete} placeholder="e.g. G, J" />
              </Field>
              <Field label="Capacity stated in sections (MW)" htmlFor="capacityInSectionsMw">
                <Input id="capacityInSectionsMw" name="capacityInSectionsMw" inputMode="decimal" defaultValue={values.capacityInSectionsMw} />
              </Field>
              <Field label="Remarks" htmlFor="remarks" className="md:col-span-2 xl:col-span-3">
                <Textarea id="remarks" name="remarks" defaultValue={values.remarks} />
              </Field>
            </Section>
          </div>
        );
      }}
    </ActionForm>
  );
}
