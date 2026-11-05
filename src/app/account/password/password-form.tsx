"use client";

import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { changePasswordAction } from "../../auth-actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Current password" htmlFor="current" errors={fe.current ? [fe.current] : undefined}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required aria-invalid={!!fe.current} />
      </Field>
      <Field label="New password" htmlFor="next" hint="At least 10 characters." errors={fe.next ? [fe.next] : undefined}>
        <Input id="next" name="next" type="password" autoComplete="new-password" required aria-invalid={!!fe.next} />
      </Field>
      <Field label="New password again" htmlFor="confirm" errors={fe.confirm ? [fe.confirm] : undefined}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={!!fe.confirm} />
      </Field>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
