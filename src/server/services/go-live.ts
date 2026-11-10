/**
 * Go-live readiness: everything that must be true before the
 * Commission relies on production, checked live from the database and the
 * environment. Shown on Admin › Go-live. Nothing here changes data.
 */
import { desc, eq, sql } from "drizzle-orm";
import { addDays } from "@/domain/dates";
import type { Role } from "@/domain/roles";
import { ROLE_LABELS } from "@/domain/roles";
import { registrationDeadline } from "@/domain/settings";
import { verifyAuditChain } from "../audit";
import { all, type Db } from "../db/connect";
import { dailyReviewRuns, holidays, signatories, userRoles, users } from "../db/schema";
import { lagosToday } from "../time";
import { getSettings } from "./settings";

export type Check = { area: string; label: string; state: "ok" | "warn" | "fail" | "info"; detail: string; href?: string };

const RECORD_TABLES = ["submissions", "payments", "own_use_notifications"] as const;

export async function goLiveChecks(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<{ production: boolean; checks: Check[] }> {
  const production = env.VERCEL_ENV === "production";
  const today = lagosToday();
  const [settings, examples, records, sigs, roleRows, pending, lastHoliday, lastRun, chain] = await all(db, [
    () => getSettings(db),
    () => db.execute<{ t: string; n: number }>(sql.raw(RECORD_TABLES.map((t) => `select '${t}' as t, count(*)::int as n from ${t} where is_example`).join(" union all "))),
    () => db.execute<{ t: string; n: number }>(sql.raw(RECORD_TABLES.map((t) => `select '${t}' as t, count(*)::int as n from ${t} where not is_example`).join(" union all "))),
    () => db.select().from(signatories).where(eq(signatories.active, true)),
    () => db.select({ role: userRoles.role }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(eq(users.active, true)),
    () => db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.pendingConfirmation, true)),
    () => db.select({ d: sql<string | null>`max(${holidays.date})::text` }).from(holidays),
    () => db.select().from(dailyReviewRuns).orderBy(desc(dailyReviewRuns.lagosDate)).limit(1),
    () => verifyAuditChain(db),
  ]);
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // Data
  const exTotal = examples.rows.reduce((n, r) => n + r.n, 0);
  add({
    area: "Data",
    label: "No EXAMPLE records",
    state: exTotal === 0 ? "ok" : production ? "fail" : "info",
    detail: exTotal === 0 ? "None." : `${exTotal} EXAMPLE row(s): ${examples.rows.filter((r) => r.n).map((r) => `${r.t} ${r.n}`).join(", ")}.${production ? " Production must never hold example data." : " Only ever in development and preview."}`,
  });
  const recTotal = records.rows.reduce((n, r) => n + r.n, 0);
  add({
    area: "Data",
    label: "Records already in the registers",
    state: "info",
    detail: recTotal ? records.rows.filter((r) => r.n).map((r) => `${r.t.replace(/_/g, " ")} ${r.n}`).join(", ") : "None: the registers are empty.",
  });

  // Order and rules
  add({
    area: "Rules",
    label: "Effective Date gazetted",
    state: settings.effectiveDatePlaceholder ? "warn" : "ok",
    detail: `${settings.effectiveDate}${settings.effectiveDatePlaceholder ? " is still a placeholder (Q2)." : ""} Registration deadline ${registrationDeadline(settings)}.`,
    href: "/admin/settings",
  });
  const has = (r: string) => sigs.some((s) => s.role === r);
  add({
    area: "Rules",
    label: "Certificate signatories",
    state: has("chairman_ceo") && has("commissioner") ? "ok" : "fail",
    detail: [has("chairman_ceo") ? null : "no active Chairman / CEO", has("commissioner") ? null : "no active Commissioner: approvals of new registrations are blocked"].filter(Boolean).join("; ") || "Chairman / CEO and Commissioner set.",
    href: "/admin/signatories",
  });
  const unconfirmed = sigs.filter((s) => !s.confirmed);
  if (unconfirmed.length) add({ area: "Rules", label: "Signatories confirmed", state: "warn", detail: `Not yet confirmed: ${unconfirmed.map((s) => s.name).join(", ")}.`, href: "/admin/signatories" });
  add({
    area: "Rules",
    label: "Holidays entered",
    state: lastHoliday[0]?.d && lastHoliday[0].d >= addDays(today, 180) ? "ok" : "warn",
    detail: lastHoliday[0]?.d ? `The last holiday on the list is ${lastHoliday[0].d}. Keep at least six months ahead; deadlines and working days depend on it.` : "No holidays entered.",
    href: "/admin/holidays",
  });

  // People
  const needed: Role[] = ["registration", "finance", "evaluator", "supervisor", "approver"];
  const missing = needed.filter((r) => !roleRows.some((x) => x.role === r));
  add({
    area: "People",
    label: "Every role has an active person",
    state: missing.length ? "warn" : "ok",
    detail: missing.length ? `No active ${missing.map((r) => ROLE_LABELS[r]).join(", ")}.` : "Yes.",
    href: "/admin/users",
  });
  if (!roleRows.some((r) => r.role === "approver") || !roleRows.some((r) => r.role === "supervisor") || !roleRows.some((r) => r.role === "evaluator")) {
    add({ area: "People", label: "Separation of duties possible", state: "warn", detail: "Approval needs four different people: approver, evaluator, supervisor and the officer who saved the submission [G8].", href: "/admin/users" });
  }
  add({
    area: "People",
    label: "Seeded staff confirmed",
    state: pending[0].n ? "warn" : "ok",
    detail: pending[0].n ? `${pending[0].n} account(s) from the workbook still awaiting confirmation.` : "All confirmed.",
    href: "/admin/users",
  });

  // Platform
  add({ area: "Platform", label: "Cron secret", state: env.CRON_SECRET && env.CRON_SECRET !== "change-me" ? "ok" : "fail", detail: !env.CRON_SECRET ? "CRON_SECRET is not set: the 07:00 daily review is refused." : env.CRON_SECRET === "change-me" ? "CRON_SECRET is still the example value from .env.example." : "CRON_SECRET is set." });
  add({
    area: "Platform",
    label: "Daily review running",
    state: lastRun[0] && lastRun[0].lagosDate >= addDays(today, -1) ? "ok" : "warn",
    detail: lastRun[0] ? `Last run ${lastRun[0].lagosDate} (${lastRun[0].trigger}).` : "Never run. It runs at 07:00 on production deployments.",
    href: "/admin/daily-review",
  });
  add({
    area: "Platform",
    label: "Public address",
    state: production && !env.BETTER_AUTH_URL ? "warn" : "ok",
    detail: env.BETTER_AUTH_URL ? `BETTER_AUTH_URL = ${env.BETTER_AUTH_URL}` : "BETTER_AUTH_URL not set: sign-in uses the Vercel URL.",
  });
  add({
    area: "Platform",
    label: "Audit log intact",
    state: chain.ok ? "ok" : "fail",
    detail: chain.ok ? `${chain.checked} entries checked; the hash chain is unbroken.` : `Broken at entry ${chain.brokenAtSeq}: ${chain.reason}`,
    href: "/audit",
  });
  return { production, checks };
}
