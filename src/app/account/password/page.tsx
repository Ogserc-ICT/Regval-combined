import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { requireActor } from "@/server/auth/session";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function PasswordPage() {
  const actor = await requireActor({ allowPasswordChange: true });
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
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
