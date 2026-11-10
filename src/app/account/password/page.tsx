import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { SessionGuard } from "@/components/shell/session-guard";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { idleMinutes } from "@/server/services/idle";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function PasswordPage() {
  const actor = await requireActor({ allowPasswordChange: true });
  const minutes = await idleMinutes(db);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      {/* The same idle limit applies here; password fields are never kept. */}
      <Suspense fallback={null}>
        <SessionGuard idleMinutes={minutes} draftPaths={[]} />
      </Suspense>
      <div className="w-full max-w-sm">
      <div className="mb-6 flex justify-center">
        <Logo height={36} priority />
      </div>
      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <h1 className="text-lg font-semibold">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted">
          {actor.mustChangePassword
            ? `Welcome, ${actor.name}. Replace the one-time password you were given before you continue.`
            : "Changing your password signs you out on your other devices."}
        </p>
        <PasswordForm />
        {!actor.mustChangePassword ? (
          <Link href="/dashboard" className="mt-4 block text-center text-sm text-muted hover:text-text">
            Cancel
          </Link>
        ) : null}
      </div>
      </div>
    </main>
  );
}
