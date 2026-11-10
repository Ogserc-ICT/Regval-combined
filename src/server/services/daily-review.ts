/**
 * Daily review (SPEC §26; modDailyReview.RunDailyReview). Runs from Vercel
 * Cron at 07:00 Lagos and from an admin button, at most once per Lagos date:
 * the run claims its date's row first, so a second trigger the same day finds
 * the row and does nothing. Everything is worked out from the state before any
 * change, then applied, all in one transaction.
 */
import { desc, eq, isNotNull } from "drizzle-orm";
import { diffDays, longDate } from "@/domain/dates";
import { ST } from "@/domain/registration/types";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { SYSTEM_ACTOR, writeAudit, type AuditActor } from "../audit";
import type { Db, DbOrTx } from "../db/connect";
import { dailyReviewRuns, submissions } from "../db/schema";
import { lagosToday } from "../time";
import { getSettings } from "./settings";
import { assessMany } from "./submissions/load";
import { notifyDecision, tryRelease } from "./submissions/workflow";

export type ReviewSummary = {
  released: string[];
  provisional: string[];
  overdueDeficiency: string[];
  registeredWithoutNumber: string[];
  red: number;
  amber: number;
  unpaid: number;
  reminderDue: string[];
  text: string;
};

export type ReviewResult = { ran: true; date: string; summary: ReviewSummary } | { ran: false; date: string; reason: string };

export async function runDailyReview(db: Db, trigger: "cron" | "manual", actor: Actor | null = null, today = lagosToday()): Promise<ReviewResult> {
  if (trigger === "manual") authorize(actor, "dailyreview:run");
  const by: AuditActor = actor ? auditActor(actor) : SYSTEM_ACTOR;
  return db.transaction(async (tx) => {
    // Claim the date. A concurrent run waits on this row and then finds it taken.
    const claimed = await tx
      .insert(dailyReviewRuns)
      .values({ lagosDate: today, trigger, userId: actor?.id ?? null, userName: by.name })
      .onConflictDoNothing()
      .returning({ d: dailyReviewRuns.lagosDate });
    if (!claimed.length) {
      const [prev] = await tx.select().from(dailyReviewRuns).where(eq(dailyReviewRuns.lagosDate, today));
      return { ran: false, date: today, reason: `Already run for ${longDate(today)} (${prev?.trigger ?? "earlier"}${prev?.userName ? `, ${prev.userName}` : ""}).` };
    }

    const settings = await getSettings(tx);
    const rows = await tx.select().from(submissions).where(isNotNull(submissions.status));
    const list = await assessMany(tx, rows, today);

    // 1–4: decide everything from the state before any change.
    const release = list.filter((x) => x.row.status === ST.AWAITING && x.a.gateCleared);
    const provisional = list.filter(
      (x) => x.row.filingType === "NEW" && x.row.status === ST.RECEIVED && !x.row.registrationNo && x.a.determinationDue && x.a.determinationDue < today,
    );
    const overdue = list.filter((x) => x.row.status === ST.DEFICIENCY && x.a.deficiencyResponseDue && x.a.deficiencyResponseDue < today);
    const noNumber = list.filter((x) => x.row.status === ST.REGISTERED && x.row.filingType === "NEW" && !x.row.registrationNo);
    // 5: counts
    const red = list.filter((x) => x.a.sla === "Red").length;
    const amber = list.filter((x) => x.a.sla === "Amber").length;
    const unpaid = list.filter((x) => (!x.a.closed || x.row.status === ST.REGISTERED) && (x.a.paymentStatus === "Unpaid" || x.a.paymentStatus === "Part-paid")).length;
    const reminder =
      settings.unpaidReminderDays === null
        ? []
        : list.filter((x) => x.row.status === ST.AWAITING && !x.a.gateCleared && diffDays(x.row.dateSubmitted, today) >= settings.unpaidReminderDays!);

    // Apply.
    const released: string[] = [];
    for (const x of release) if (await tryRelease(tx, actor, x.row.id)) released.push(x.row.ackNo);
    for (const x of provisional) {
      await tx.update(submissions).set({ status: ST.PROVISIONAL, updatedAt: new Date() }).where(eq(submissions.id, x.row.id));
      await writeAudit(tx, {
        actor: by,
        action: "Provisional registration",
        module: "registration",
        entityType: "submission",
        entityId: x.row.id,
        reference: x.row.ackNo,
        detail: `Determination due ${longDate(x.a.determinationDue!)} has passed: provisionally registered (para 13(4)); the Ack No. serves as the registration number`,
      });
      await notifyDecision(tx, actor, x.row.id, x.row.ackNo, `Provisionally registered: ${x.row.ackNo}`, x.row.registeredName);
    }
    // Deficiency responses past due are listed only: never lapsed automatically.

    const summary: ReviewSummary = {
      released,
      provisional: provisional.map((x) => x.row.ackNo),
      overdueDeficiency: overdue.map((x) => x.row.ackNo),
      registeredWithoutNumber: noNumber.map((x) => x.row.ackNo),
      red,
      amber,
      unpaid,
      reminderDue: reminder.map((x) => x.row.ackNo),
      text: "",
    };
    summary.text =
      `Provisional today: ${summary.provisional.length}; overdue deficiency responses: ${summary.overdueDeficiency.length}; ` +
      `registered without a number: ${summary.registeredWithoutNumber.length}; red: ${red}; amber: ${amber}; unpaid/part-paid: ${unpaid}; ` +
      `released for evaluation: ${released.length}` +
      (settings.unpaidReminderDays === null ? "" : `; unpaid reminders due (${settings.unpaidReminderDays}+ days): ${summary.reminderDue.length}`);
    await writeAudit(tx, { actor: by, action: "Daily review", module: "system", detail: `${trigger === "cron" ? "Scheduled" : "Run now"}: ${summary.text}`, data: summary });
    await tx.update(dailyReviewRuns).set({ finishedAt: new Date(), summary }).where(eq(dailyReviewRuns.lagosDate, today));
    return { ran: true, date: today, summary };
  });
}

export async function listReviewRuns(db: DbOrTx, limit = 60) {
  return db.select().from(dailyReviewRuns).orderBy(desc(dailyReviewRuns.lagosDate)).limit(limit);
}
