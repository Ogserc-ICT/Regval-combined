import Link from "next/link";
import { LogOut } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-provider";
import { LiveUpdates } from "@/components/shell/live-updates";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NAV } from "@/components/shell/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { shortDate } from "@/domain/dates";
import { ROLE_LABELS } from "@/domain/roles";
import { registrationDeadline } from "@/domain/settings";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getSettings } from "@/server/services/settings";
import { lagosToday } from "@/server/time";
import { signOutAction } from "../auth-actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  const settings = await getSettings(db);
  const isAdmin = actor.roles.includes("admin");
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(actor, i.permission)) })).filter((g) => g.items.length);
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  const roleLabels = actor.roles.map((r) => ROLE_LABELS[r]).join(", ") || "No roles";
  const env = process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development");

  return (
    <div className="flex min-h-dvh">
      <Sidebar groups={groups} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-4 backdrop-blur md:px-6">
          <MobileNav groups={groups} userName={actor.name} userRoles={roleLabels} />
          <Link href="/dashboard" className="md:hidden" aria-label="Dashboard">
            <LogoMark size={30} />
          </Link>
          <p className="hidden text-sm text-muted sm:block">
            Today <span className="tabular font-medium text-text">{shortDate(lagosToday())}</span>
            <span className="text-faint"> · Africa/Lagos</span>
          </p>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <div className="ml-2 hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{actor.name}</p>
              <p className="max-w-64 truncate text-xs text-faint">{roleLabels}</p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-muted hover:bg-surface-hover hover:text-text"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden lg:inline">Sign out</span>
              </button>
            </form>
          </div>
        </header>

        {isAdmin && settings.effectiveDatePlaceholder ? (
          <div className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-xs sm:text-sm md:px-6" role="status">
            <span className="font-medium text-warn">Effective Date is a placeholder.</span>{" "}
            <span className="text-text">
              {shortDate(settings.effectiveDate)} (registration deadline {shortDate(registrationDeadline(settings))}). Every deadline
              depends on it.{" "}
              <Link href="/admin/settings" className="font-medium text-info underline-offset-2 hover:underline">
                Enter the gazetted date
              </Link>
            </span>
          </div>
        ) : null}

        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-8">{children}</main>

        <LiveUpdates />

        <footer className="border-t border-border px-4 py-3 text-xs text-faint md:px-6">
          OGSERC Registry &amp; Evaluation · staff only
          {isAdmin ? (
            <span className="tabular">
              {" "}
              · {env} · build {commit ? commit.slice(0, 7) : "local (no commit)"}
            </span>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
