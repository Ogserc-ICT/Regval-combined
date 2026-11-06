/**
 * Go-live readiness (Phase 6): everything that must be true before the
 * Commission relies on production, checked live from the database and the
 * environment. Shown on Admin › Go-live. Nothing here changes data.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { addDays } from "@/domain/dates";
import type { Role } from "@/domain/roles";
import { ROLE_LABELS } from "@/domain/roles";
import { registrationDeadline } from "@/domain/settings";
import { verifyAuditChain } from "../audit";
import { blobEnabled } from "../blob";
import { all, type Db } from "../db/connect";
import { dailyReviewRuns, divisions, holidays, importRuns, signatories, units, userRoles, users } from "../db/schema";
import { lagosToday } from "../time";
import { getSettings } from "./settings";

export type Check = { area: string; label: string; state: "ok" | "warn" | "fail" | "info"; detail: string; href?: string };

const EXAMPLE_TABLES = ["inward_items", "outward_items", "front_desk_items", "files", "file_movements", "submissions", "payments", "own_use_notifications"] as const;
const RECORD_TABLES = ["front_desk_items", "inward_items", "outward_items", "files", "submissions", "payments", "own_use_notifications"] as const;

export async function goLiveChecks(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<{ production: boolean; checks: Check[] }> {
  const production = env.VERCEL_ENV === "production";
  const today = lagosToday();
  const [settings, examples, records, sigs, roleRows, pending, unitRows, divs, lastHoliday, lastRun, lastImport, chain] = await all(db, [
    () => getSettings(db),
    () => db.execute<{ t: string; n: number }>(sql.raw(EXAMPLE_TABLES.map((t) => `select '${t}' as t, count(*)::int as n from ${t} where is_example`).join(" union all "))),
    () => db.execute<{ t: string; n: number }>(sql.raw(RECORD_TABLES.map((t) => `select '${t}' as t, count(*)::int as n from ${t} where not is_example`).join(" union all "))),
    () => db.select().from(signatories).where(eq(signatories.active, true)),
    () => db.select({ role: userRoles.role }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(eq(users.active, true)),
    () => db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.pendingConfirmation, true)),
    () => db.select().from(units).where(eq(units.active, true)),
    () => db.select().from(divisions),
    () => db.select({ d: sql<string | null>`max(${holidays.date})::text` }).from(holidays),
    () => db.select().from(dailyReviewRuns).orderBy(desc(dailyReviewRuns.lagosDate)).limit(1),
    () => db.select().from(importRuns).where(and(eq(importRuns.mode, "real"), eq(importRuns.dryRun, 0))).orderBy(desc(importRuns.at)).limit(1),
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
    detail: exTotal === 0 ? "None." : `${exTotal} EXAMPLE row(s): ${examples.rows.filter((r) => r.n).map((r) => `${r.t} ${r.n}`).join(", ")}.${production ? " Production must have none [G4]." : " Expected in development and preview."}`,
  });
  const recTotal = records.rows.reduce((n, r) => n + r.n, 0);
  add({
    area: "Data",
    label: "Records already in the registers",
    state: "info",
    detail: recTotal ? records.rows.filter((r) => r.n).map((r) => `${r.t.replace(/_/g, " ")} ${r.n}`).join(", ") : "None: the registers are empty.",
  });
  add({
    area: "Data",
    label: "Workbook imported",
    state: lastImport.length ? "ok" : "warn",
    detail: lastImport.length ? `${lastImport[0].sourceName}, ${lastImport[0].at.toISOString().slice(0, 10)} by ${lastImport[0].userName}.` : "Not yet. Run a dry run, check the report, then import (Admin › Import).",
    href: "/admin/import",
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
  const needed: Role[] = ["registry", "router", "front_desk", "finance", "evaluator", "supervisor", "approver"];
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

  // Email and outputs
  const divEmail = (id: string | null) => divs.find((d) => d.id === id)?.email;
  const noAddress = unitRows.filter((u) => !u.email && !divEmail(u.divisionId));
  add({
    area: "Email",
    label: "Units can be emailed",
    state: noAddress.length ? "warn" : "ok",
    detail: noAddress.length ? `${noAddress.length} active unit(s) with no unit or division address.` : "Every active unit has an address.",
    href: "/admin/reference/units",
  });
  const provider = (env.EMAIL_PROVIDER ?? "console").toLowerCase();
  add({
    area: "Email",
    label: "Email provider",
    state: provider === "console" ? (production ? "warn" : "info") : "ok",
    detail:
      provider === "console"
        ? "EMAIL_PROVIDER is console: emails are written to the log, nothing is sent (Q19)."
        : `${provider}${provider === "resend" && !env.RESEND_API_KEY ? " without RESEND_API_KEY" : ""}; acknowledgement email mode ${settings.ackEmailMode}.`,
  });
  add({ area: "Email", label: "Slips kept in Vercel Blob", state: blobEnabled(env) ? "ok" : production ? "warn" : "info", detail: blobEnabled(env) ? "BLOB_READ_WRITE_TOKEN is set." : "BLOB_READ_WRITE_TOKEN is not set: slips are attached but not kept." });

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
