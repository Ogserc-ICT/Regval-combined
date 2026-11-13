/**
 * Admin data tools (Admin › Data management): clear chosen registers and setup
 * (up to a factory reset), and delete single entries. Admin only; clearing
 * also needs the admin's password. Staff accounts and roles are always kept,
 * and the audit log is never cleared: every clear and delete is recorded in it.
 *
 * The database refuses deletes by default (migration 0003). These functions
 * set `ogserc.allow_delete` for their own transaction only (migration 0013).
 */
import { verifyPassword } from "better-auth/crypto";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import holidaySeed from "../../../seed/data/holidays.json";
import referenceSeed from "../../../seed/data/reference.json";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import type { Db, DbOrTx, Tx } from "../db/connect";
import {
  accounts,
  activities,
  counters,
  dailyReviewRuns,
  deficiencyNotices,
  documentChecklist,
  evaluationAnswers,
  evaluations,
  feeSchedule,
  formDrafts,
  holidays,
  listItems,
  notifications,
  ownUseNotifications,
  ownUseUnits,
  payments,
  settings,
  signatories,
  submissionLicences,
  submissionOtherActivities,
  submissions,
} from "../db/schema";
import { blocked, notFound, Problems } from "../errors";

/** What can be cleared. `recommended` groups are ticked by default (a factory reset of the entries). */
export const CLEAR_GROUPS = {
  register: { label: "Register entries", detail: "Every submission with its payments, documents checklist, evaluation and deficiency notices", recommended: true, setup: false },
  ownUse: { label: "Own-use notifications", detail: "Every notification with its generator units, payments and documents checklist", recommended: true, setup: false },
  notifications: { label: "Notifications", detail: "Everyone's bell notifications", recommended: true, setup: false },
  drafts: { label: "Saved form drafts", detail: "Typing kept across an idle sign-out", recommended: true, setup: false },
  dailyReview: { label: "Daily review history", detail: "The record of past daily review runs (it can run again today)", recommended: false, setup: false },
  settings: { label: "Settings", detail: "Every setting back to its default, including the Effective Date placeholder", recommended: false, setup: true },
  fees: { label: "Fee table and activity map", detail: "Back to the workbook's Schedule 3 values and activity categories", recommended: false, setup: true },
  lists: { label: "Drop-down lists", detail: "Back to the workbook's lists (values you added are removed)", recommended: false, setup: true },
  holidays: { label: "Holidays", detail: "Back to the workbook's holiday list", recommended: false, setup: true },
  signatories: { label: "Signatories", detail: "Back to the seed: Jide Onakoya, Chairman / CEO, unconfirmed; no Commissioner", recommended: false, setup: true },
} as const;
export type ClearGroup = keyof typeof CLEAR_GROUPS;
export const isClearGroup = (g: string): g is ClearGroup => g in CLEAR_GROUPS;

const allowDeletes = (tx: Tx) => tx.execute(sql`select set_config('ogserc.allow_delete', 'on', true)`);
async function n(tx: DbOrTx, q: ReturnType<typeof sql>): Promise<number> {
  const r = await tx.execute<{ n: number }>(q);
  return Number(r.rows[0]?.n ?? 0);
}

/** How many records each group holds now (shown next to each checkbox). */
export async function dataCounts(db: DbOrTx): Promise<Record<ClearGroup, number>> {
  return {
    register: await n(db, sql`select count(*)::int as n from ${submissions}`),
    ownUse: await n(db, sql`select count(*)::int as n from ${ownUseNotifications}`),
    notifications: await n(db, sql`select count(*)::int as n from ${notifications}`),
    drafts: await n(db, sql`select count(*)::int as n from ${formDrafts}`),
    dailyReview: await n(db, sql`select count(*)::int as n from ${dailyReviewRuns}`),
    settings: await n(db, sql`select count(*)::int as n from ${settings}`),
    fees: await n(db, sql`select count(*)::int as n from ${feeSchedule}`),
    lists: await n(db, sql`select count(*)::int as n from ${listItems}`),
    holidays: await n(db, sql`select count(*)::int as n from ${holidays}`),
    signatories: await n(db, sql`select count(*)::int as n from ${signatories}`),
  };
}

async function checkPassword(db: DbOrTx, actor: Actor, password: string) {
  const [acc] = await db
    .select({ hash: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, actor.id), eq(accounts.providerId, "credential")));
  const ok = !!acc?.hash && !!password && (await verifyPassword({ hash: acc.hash, password }));
  if (!ok) new Problems().field("password", "That is not your password.").throwIfAny("blocked");
}

/** A series restarts at 1 once nothing holds one of its numbers. */
async function restartEmptySeries(tx: Tx): Promise<string[]> {
  const held: Record<string, number> = {
    ACK: (await n(tx, sql`select count(*)::int as n from ${submissions}`)) + (await n(tx, sql`select count(*)::int as n from ${ownUseNotifications}`)),
    PAY: await n(tx, sql`select count(*)::int as n from ${payments}`),
    OUN: await n(tx, sql`select count(*)::int as n from ${ownUseNotifications} where ${ownUseNotifications.ounNo} is not null`),
    DEF: await n(tx, sql`select count(*)::int as n from ${deficiencyNotices}`),
    REG:
      (await n(tx, sql`select count(*)::int as n from ${submissions} where ${submissions.registrationNo} is not null`)) +
      (await n(tx, sql`select count(*)::int as n from ${ownUseNotifications} where ${ownUseNotifications.registrationNo} is not null`)),
    CERT: await n(tx, sql`select count(*)::int as n from ${submissions} where ${submissions.certificateSerial} is not null`),
  };
  const empty = Object.entries(held).filter(([, v]) => v === 0).map(([k]) => k);
  if (!empty.length) return [];
  const gone = await tx.delete(counters).where(inArray(counters.series, empty)).returning({ series: counters.series });
  return [...new Set(gone.map((g) => g.series))].sort();
}

async function clearSubmissions(tx: Tx, ids?: string[]): Promise<number> {
  const only = <T>(col: T) => (ids ? inArray(col as never, ids) : undefined);
  await tx.delete(deficiencyNotices).where(only(deficiencyNotices.submissionId));
  await tx.delete(evaluationAnswers).where(only(evaluationAnswers.submissionId));
  await tx.delete(evaluations).where(only(evaluations.submissionId));
  await tx.delete(submissionLicences).where(only(submissionLicences.submissionId));
  await tx.delete(submissionOtherActivities).where(only(submissionOtherActivities.submissionId));
  await tx.delete(documentChecklist).where(and(eq(documentChecklist.ownerType, "submission"), only(documentChecklist.ownerId)));
  await tx.delete(payments).where(and(eq(payments.ownerType, "submission"), only(payments.ownerId)));
  const gone = await tx.delete(submissions).where(only(submissions.id)).returning({ id: submissions.id });
  return gone.length;
}

async function clearOwnUse(tx: Tx, ids?: string[]): Promise<number> {
  const only = <T>(col: T) => (ids ? inArray(col as never, ids) : undefined);
  await tx.delete(ownUseUnits).where(only(ownUseUnits.notificationId));
  await tx.delete(documentChecklist).where(and(eq(documentChecklist.ownerType, "own_use"), only(documentChecklist.ownerId)));
  await tx.delete(payments).where(and(eq(payments.ownerType, "own_use"), only(payments.ownerId)));
  const gone = await tx.delete(ownUseNotifications).where(only(ownUseNotifications.id)).returning({ id: ownUseNotifications.id });
  return gone.length;
}

type RefSeed = {
  fees: { category: string; registrationFee: number; lateInitial: number; lateDaily: number; lateCap: number; lateTier: number | null; description: string }[];
  activities: { name: string; code: string; cat10MwPlus: string; cat1To10Mw: string; catBelow1Mw: string; capacityBased: boolean; sort: number }[];
  lists: { listKey: string; value: string; sort: number }[];
  signatories: { name: string; designation: string }[];
};
type HolidaySeed = { date: string; name: string; status: "Fixed" | "Provisional" | "Estimated" | "State-declared"; note?: string }[];

async function restoreSetup(tx: Tx, group: ClearGroup): Promise<number> {
  const ref = referenceSeed as unknown as RefSeed;
  switch (group) {
    case "settings":
      return (await tx.delete(settings).returning({ k: settings.key })).length;
    case "fees": {
      for (const f of ref.fees) {
        await tx.insert(feeSchedule).values(f).onConflictDoUpdate({ target: feeSchedule.category, set: { ...f, updatedAt: new Date() } });
      }
      for (const a of ref.activities) {
        await tx.insert(activities).values({ ...a, active: true }).onConflictDoUpdate({ target: activities.code, set: { ...a, active: true } });
      }
      return ref.fees.length + ref.activities.length;
    }
    case "lists": {
      await tx.delete(listItems);
      await tx.insert(listItems).values(ref.lists.map((l) => ({ ...l, active: true })));
      return ref.lists.length;
    }
    case "holidays": {
      await tx.delete(holidays);
      const rows = holidaySeed as HolidaySeed;
      if (rows.length) await tx.insert(holidays).values(rows.map((h) => ({ date: h.date, name: h.name, status: h.status, note: h.note ?? null })));
      return rows.length;
    }
    case "signatories": {
      await tx.delete(signatories);
      for (const sg of ref.signatories) {
        const role = /chairman/i.test(sg.designation) ? "chairman_ceo" : /secretary/i.test(sg.designation) ? "secretary" : "other";
        await tx.insert(signatories).values({
          name: sg.name,
          designation: role === "chairman_ceo" ? "Chairman / Chief Executive Officer" : sg.designation,
          role,
          confirmed: false,
          note: `From the workbook (designation “${sg.designation}”). Confirm before use (Q12).`,
        });
      }
      return ref.signatories.length;
    }
    default:
      return 0;
  }
}

export type ClearResult = { cleared: Partial<Record<ClearGroup, number>>; restarted: string[] };

/**
 * Clear the chosen groups in one transaction (all or nothing). Ticking every
 * group is a factory reset; staff, roles and the audit log always stay.
 */
export async function clearData(db: Db, actor: Actor | null, groups: string[], password: string): Promise<ClearResult> {
  authorize(actor, "data:clear");
  const chosen = [...new Set(groups)].filter(isClearGroup);
  if (!chosen.length) new Problems().reason("Tick at least one thing to clear.").throwIfAny("blocked");
  await checkPassword(db, actor, password);
  return db.transaction(async (tx) => {
    await allowDeletes(tx);
    const cleared: Partial<Record<ClearGroup, number>> = {};
    if (chosen.includes("register")) cleared.register = await clearSubmissions(tx);
    if (chosen.includes("ownUse")) cleared.ownUse = await clearOwnUse(tx);
    if (chosen.includes("notifications")) cleared.notifications = (await tx.delete(notifications).returning({ id: notifications.id })).length;
    if (chosen.includes("drafts")) cleared.drafts = (await tx.delete(formDrafts).returning({ id: formDrafts.id })).length;
    if (chosen.includes("dailyReview")) cleared.dailyReview = (await tx.delete(dailyReviewRuns).returning({ d: dailyReviewRuns.lagosDate })).length;
    for (const g of chosen) if (CLEAR_GROUPS[g].setup) cleared[g] = await restoreSetup(tx, g);
    const restarted = await restartEmptySeries(tx);
    const all = (Object.keys(CLEAR_GROUPS) as ClearGroup[]).every((g) => chosen.includes(g));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: all ? "Factory reset" : "Data cleared",
      module: "admin",
      detail: `${(Object.entries(cleared) as [ClearGroup, number][]).map(([g, c]) => `${CLEAR_GROUPS[g].label}: ${CLEAR_GROUPS[g].setup ? "back to defaults" : `${c} removed`}`).join("; ")}${restarted.length ? `. Number series restarted at 1: ${restarted.join(", ")}` : ""}. Staff, roles and the audit log kept.`,
      data: { cleared, restarted },
    });
    return { cleared, restarted };
  });
}

/** Notifications that point at a deleted entry would lead nowhere. */
async function dropNotificationsFor(tx: Tx, hrefPrefix: string) {
  await tx.delete(notifications).where(or(eq(notifications.href, hrefPrefix), like(notifications.href, `${hrefPrefix}?%`)));
}

/** Delete one Register entry with its payments, documents, evaluation and deficiency notices. */
export async function deleteSubmission(db: Db, actor: Actor | null, id: string, confirmAck: string): Promise<string> {
  authorize(actor, "data:clear");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(submissions).where(eq(submissions.id, id)).for("update");
    if (!row) throw notFound("Submission");
    const p = new Problems();
    if (confirmAck.trim().toUpperCase() !== row.ackNo.toUpperCase()) p.field("confirmAck", `Type ${row.ackNo} to confirm.`);
    const linked = await tx
      .select({ ack: submissions.ackNo })
      .from(submissions)
      .where(eq(submissions.linkedSubmissionId, id));
    for (const l of linked) p.reason(`${l.ack} is an update or annual confirmation linked to this registration: delete it first.`);
    p.throwIfAny("blocked");
    await allowDeletes(tx);
    const pays = await tx.select({ no: payments.payNo }).from(payments).where(and(eq(payments.ownerType, "submission"), eq(payments.ownerId, id)));
    await clearSubmissions(tx, [id]);
    await dropNotificationsFor(tx, `/register/${id}`);
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Submission deleted",
      module: "admin",
      entityType: "submission",
      entityId: id,
      reference: row.ackNo,
      detail: `${row.registeredName} (${row.status ?? "not saved"})${row.registrationNo ? `, ${row.registrationNo}` : ""}; ${pays.length} payment(s) deleted with it${pays.length ? `: ${pays.map((x) => x.no).join(", ")}` : ""}. Its numbers are not reused.`,
    });
    return row.ackNo;
  });
}

/** Delete one own-use notification with its units, payments and documents. */
export async function deleteOwnUse(db: Db, actor: Actor | null, id: string, confirmAck: string): Promise<string> {
  authorize(actor, "data:clear");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(ownUseNotifications).where(eq(ownUseNotifications.id, id)).for("update");
    if (!row) throw notFound("Own-use notification");
    if (confirmAck.trim().toUpperCase() !== row.ackNo.toUpperCase()) new Problems().field("confirmAck", `Type ${row.ackNo} to confirm.`).throwIfAny("blocked");
    await allowDeletes(tx);
    const pays = await tx.select({ no: payments.payNo }).from(payments).where(and(eq(payments.ownerType, "own_use"), eq(payments.ownerId, id)));
    await clearOwnUse(tx, [id]);
    await dropNotificationsFor(tx, `/own-use/${id}`);
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Own-use notification deleted",
      module: "admin",
      entityType: "own_use",
      entityId: id,
      reference: row.ackNo,
      detail: `${row.name}${row.ounNo ? ` (${row.ounNo})` : ""}; ${pays.length} payment(s) deleted with it. Its numbers are not reused.`,
    });
    return row.ackNo;
  });
}

/**
 * Delete one payment recorded in error. A confirmed payment counts towards the Finance gate, so
 * it must be reversed first (Finance or Admin); pending, rejected and reversed ones can go.
 */
export async function deletePayment(db: Db, actor: Actor | null, id: string): Promise<string> {
  authorize(actor, "data:clear");
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, id)).for("update");
    if (!p) throw notFound("Payment");
    if (p.financeStatus === "Confirmed" && !p.reversed) throw blocked(`${p.payNo} is confirmed by Finance and counts towards the gate. Reverse it first, then delete it.`);
    await allowDeletes(tx);
    await tx.delete(payments).where(eq(payments.id, id));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Payment deleted",
      module: "admin",
      entityType: p.ownerType === "submission" ? "submission" : "own_use",
      entityId: p.ownerId,
      reference: p.reference,
      detail: `${p.payNo} (${p.financeStatus}${p.reversed ? ", reversed" : ""}), ${p.amount / 100} NGN, recorded by ${p.recordedByName}. Its number is not reused.`,
    });
    return p.payNo;
  });
}
