"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { createOwnUseAction } from "./actions";

export function OwnUseForm({ lgas, fuels, today, thresholdKw }: { lgas: string[]; fuels: string[]; today: string; thresholdKw: number }) {
  const [units, setUnits] = useState([0]);
  return (
    <ActionForm action={createOwnUseAction} submitLabel="Save notification" pendingLabel="Saving…">
      {(fe) => (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Notifier and site" description="One notification per site. Saving issues the ACK (shared series) and the OUN number." />
            <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Name *" htmlFor="name" errors={fe.name} className="md:col-span-2">
                <Input id="name" name="name" />
              </Field>
              <Field label="Date filed *" htmlFor="dateFiled" errors={fe.dateFiled}>
                <Input id="dateFiled" name="dateFiled" type="date" defaultValue={today} />
              </Field>
              <Field label="CAC no." htmlFor="cacNo" errors={fe.cacNo}>
                <Input id="cacNo" name="cacNo" />
              </Field>
              <Field label="Site address" htmlFor="siteAddress" className="md:col-span-2">
                <Input id="siteAddress" name="siteAddress" />
              </Field>
              <Field label="LGA *" htmlFor="lga" errors={fe.lga}>
                <Select id="lga" name="lga" defaultValue="">
                  <option value="">—</option>
                  {lgas.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Nature of business" htmlFor="natureOfBusiness">
                <Input id="natureOfBusiness" name="natureOfBusiness" />
              </Field>
              <Field label="Grid connected?" htmlFor="gridConnected">
                <Select id="gridConnected" name="gridConnected" defaultValue="">
                  <option value="">—</option>
                  <option value="Y">Y</option>
                  <option value="N">N</option>
                </Select>
              </Field>
              <Field label="Distribution licensee" htmlFor="distributionLicensee">
                <Input id="distributionLicensee" name="distributionLicensee" />
              </Field>
              <Field label="Contact person" htmlFor="contactPerson">
                <Input id="contactPerson" name="contactPerson" />
              </Field>
              <Field label="Phone" htmlFor="phone" hint="11 digits starting with 0, or +234 and 10 digits" errors={fe.phone}>
                <Input id="phone" name="phone" inputMode="tel" />
              </Field>
              <Field label="Email" htmlFor="email" errors={fe.email}>
                <Input id="email" name="email" type="email" />
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Generator units" description={`Capacity is the sum of the units. Notification applies from ${thresholdKw} kW to below 1 MW (para 3(4)); 1 MW or more registers as captive generation.`} />
            <CardBody className="flex flex-col gap-2">
              {units.map((k, i) => (
                <div key={k} className="grid gap-2 md:grid-cols-[1fr_8rem_10rem_8rem_auto]">
                  <Input name="unitMake" placeholder="Make / model" aria-label={`Unit ${i + 1} make`} />
                  <Input name="unitKw" inputMode="decimal" placeholder="kW" aria-label={`Unit ${i + 1} kW`} />
                  <Select name="unitFuel" defaultValue="" aria-label={`Unit ${i + 1} fuel`}>
                    <option value="">Fuel</option>
                    {fuels.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </Select>
                  <Input name="unitMwh" inputMode="decimal" placeholder="Avg MWh" aria-label={`Unit ${i + 1} average MWh`} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setUnits(units.filter((x) => x !== k))} aria-label="Remove unit" disabled={units.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {fe.units ? <p className="text-xs text-danger">{fe.units.join(" ")}</p> : null}
              <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setUnits([...units, Math.max(...units) + 1])}>
                <Plus className="h-4 w-4" /> Add a unit
              </Button>
              <Field label="Remarks" htmlFor="remarks" className="mt-2">
                <Textarea id="remarks" name="remarks" />
              </Field>
            </CardBody>
          </Card>
        </div>
      )}
    </ActionForm>
  );
}
