"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, Field, FormErrors, Input, Notice } from "@/components/ui";
import type { Role } from "@/domain/roles";
import { resetPasswordAction, updateUserAction } from "../../actions";
import { RolePicker } from "../role-picker";

type U = { id: string; name: string; email: string; active: boolean; pendingConfirmation: boolean; roles: Role[] };

export function EditUserForm({ user }: { user: U }) {
  const [state, action, pending] = useActionState(updateUserAction, undefined);
  const [reset, resetAction, resetting] = useActionState(resetPasswordAction, undefined);
  const fe = state && !state.ok ? state.fieldErrors : {};
  const placeholderEmail = user.email.endsWith("@invalid.ogserc.local");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Account" />
        <CardBody>
          {state?.ok ? <Notice tone="accent" className="mb-4">{state.message}</Notice> : null}
          {state && !state.ok && !Object.keys(fe).length ? <div className="mb-4"><FormErrors reasons={state.reasons} /></div> : null}
          {user.pendingConfirmation ? (
            <Notice tone="warn" title="Seeded from the workbook" className="mb-4">
              Check the name and roles, enter the work email, then tick Confirmed and Active.
            </Notice>
          ) : null}
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={user.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" htmlFor="name" errors={fe.name}>
                <Input id="name" name="name" defaultValue={user.name} required />
              </Field>
              <Field label="Work email" htmlFor="email" errors={fe.email}>
                <Input id="email" name="email" type="email" defaultValue={placeholderEmail ? "" : user.email} placeholder={placeholderEmail ? "Not set yet" : undefined} required />
              </Field>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={user.active} className="h-4 w-4 accent-[var(--accent)]" /> Active (can sign in)
              </label>
              {user.pendingConfirmation ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="confirm" className="h-4 w-4 accent-[var(--accent)]" /> Confirmed by admin
                </label>
              ) : null}
            </div>
            <RolePicker selected={user.roles} />
            {fe.roles ? <p className="text-xs text-danger">{fe.roles.join(" ")}</p> : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Password" description="Issue a one-time password. The person is signed out everywhere and must choose a new one." />
        <CardBody>
          {reset?.ok ? (
            <Notice tone="accent" className="mb-4">
              One-time password, shown only now: <code className="rounded bg-surface px-2 py-0.5 font-mono text-base">{reset.data}</code>
            </Notice>
          ) : null}
          {reset && !reset.ok ? <div className="mb-4"><FormErrors reasons={reset.reasons} /></div> : null}
          <form action={resetAction}>
            <input type="hidden" name="id" value={user.id} />
            <Button type="submit" variant="secondary" disabled={resetting}>
              {resetting ? "Issuing…" : "Issue one-time password"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
