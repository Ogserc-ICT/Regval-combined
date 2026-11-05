"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, Field, FormErrors, Input, Notice } from "@/components/ui";
import { createUserAction } from "../actions";
import { UnitField } from "./[id]/edit-user-form";
import { RolePicker } from "./role-picker";

export function NewUserForm({ units }: { units: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createUserAction, undefined);
  const fe = state && !state.ok ? state.fieldErrors : {};
  return (
    <Card>
      <CardHeader title="Add a staff account" description="The person signs in with a one-time password and must choose their own at once." />
      <CardBody>
        {state?.ok && state.data.tempPassword ? (
          <Notice tone="accent" title="Account created" className="mb-4">
            One-time password, shown only now:{" "}
            <code className="rounded bg-surface px-2 py-0.5 font-mono text-base">{state.data.tempPassword}</code>. Give it to the person
            directly.
          </Notice>
        ) : null}
        {state && !state.ok && !Object.keys(fe).length ? <FormErrors reasons={state.reasons} /> : null}
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name" htmlFor="name" errors={fe.name}>
              <Input id="name" name="name" required autoComplete="off" />
            </Field>
            <Field label="Work email" htmlFor="email" errors={fe.email}>
              <Input id="email" name="email" type="email" required autoComplete="off" />
            </Field>
          </div>
          <RolePicker />
          {fe.roles ? <p className="text-xs text-danger">{fe.roles.join(" ")}</p> : null}
          <UnitField units={units} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
