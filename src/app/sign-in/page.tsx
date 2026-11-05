import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getCurrentActor } from "@/server/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getCurrentActor()) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-text">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold">OGSERC Registry &amp; Evaluation</p>
            <p className="text-sm text-faint">Ogun State Electricity Regulatory Commission</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Staff only. Accounts are created by an admin.</p>
          <SignInForm />
        </div>
      </div>
    </main>
  );
}
