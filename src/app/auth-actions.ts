"use server";

import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getCurrentActor } from "@/server/auth/session";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { markPasswordChanged, MIN_PASSWORD_LENGTH } from "@/server/services/users";

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const [u] = await db.select({ id: users.id, name: users.name, active: users.active, mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.email, email));
  if (u && !u.active) {
    await db.transaction((tx) =>
      writeAudit(tx, { actor: { id: u.id, name: u.name }, action: "Sign-in refused", module: "auth", entityType: "user", entityId: u.id, detail: "Account not active" }),
    );
    return { error: "This account is not active. Ask an admin to activate it." };
  }
  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (e) {
    if (isAPIError(e)) {
      await db.transaction((tx) =>
        writeAudit(tx, {
          actor: u ? { id: u.id, name: u.name } : { id: null, name: email },
          action: "Sign-in failed",
          module: "auth",
          entityType: "user",
          entityId: u?.id ?? null,
          detail: e.status === "TOO_MANY_REQUESTS" ? "Too many attempts" : "Wrong email or password",
        }),
      );
      if (e.status === "TOO_MANY_REQUESTS") return { error: "Too many attempts. Wait a minute and try again." };
      return { error: "Email or password is incorrect." };
    }
    throw e;
  }
  await db.transaction((tx) =>
    writeAudit(tx, { actor: { id: u!.id, name: u!.name }, action: "Signed in", module: "auth", entityType: "user", entityId: u!.id }),
  );
  redirect(u!.mustChangePassword ? "/account/password" : "/dashboard");
}

export async function signOutAction(): Promise<void> {
  const actor = await getCurrentActor();
  await auth.api.signOut({ headers: await headers() });
  if (actor) {
    await db.transaction((tx) =>
      writeAudit(tx, { actor: { id: actor.id, name: actor.name }, action: "Signed out", module: "auth", entityType: "user", entityId: actor.id }),
    );
  }
  redirect("/sign-in");
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/sign-in");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (!current) fieldErrors.current = "Enter your current (or one-time) password.";
  if (next.length < MIN_PASSWORD_LENGTH) fieldErrors.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  else if (next === current) fieldErrors.next = "Choose a password different from the current one.";
  if (confirm !== next) fieldErrors.confirm = "The two new passwords do not match.";
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  try {
    await auth.api.changePassword({
      body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (e) {
    if (isAPIError(e)) return { fieldErrors: { current: "Your current password is not correct." } };
    throw e;
  }
  await markPasswordChanged(db, actor);
  redirect("/dashboard");
}
