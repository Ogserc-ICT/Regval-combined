"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, Field, FormErrors, Input, Notice, Select } from "@/components/ui";
import { saveHolidayAction } from "../actions";

const STATUSES = ["Fixed", "Provisional", "Estimated", "State-declared"];

export function HolidayForm() {
  const [state, action, pending] = useActionState(saveHolidayAction, undefined);
  const fe = state && !state.ok ? state.fieldErrors : {};
  return (
    <Card>
      <CardHeader title="Add or change a holiday" description="Saving a date that is already listed replaces it." />
      <CardBody>
        <form action={action} className="grid gap-4 md:grid-cols-[10rem_1fr_11rem_1fr_auto] md:items-end">
          <Field label="Date" htmlFor="date" errors={fe.date}>
            <Input id="date" name="date" type="date" required />
          </Field>
          <Field label="Holiday" htmlFor="name" errors={fe.name}>
            <Input id="name" name="name" required />
          </Field>
          <Field label="Status" htmlFor="status" errors={fe.status}>
            <Select id="status" name="status" defaultValue="Fixed">
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note" htmlFor="note">
            <Input id="note" name="note" placeholder="e.g. Confirm FG declaration" />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
        <div className="mt-3">
          {state && !state.ok && !Object.keys(fe).length ? <FormErrors reasons={state.reasons} /> : null}
          {state?.ok ? <Notice tone="accent">{state.message}</Notice> : null}
        </div>
      </CardBody>
    </Card>
  );
}
