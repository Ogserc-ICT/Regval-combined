"use client";

import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { signInAction } from "../auth-actions";

export function SignInForm() {
  const [state, action, pending] = useActionState(signInAction, undefined);
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
