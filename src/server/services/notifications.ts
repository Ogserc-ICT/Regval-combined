/**
 * Notifications (docs/PLAN.md §11f, 8b). `notify` is called inside the
 * transaction of the action it reports, so a notification exists exactly when
 * the action committed. The person who acted is never notified.
 */
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Role } from "@/domain/roles";
import type { NotificationItem } from "@/lib/pulse";
import type { Actor } from "../auth/actor";
import { all, type DbOrTx, type Tx } from "../db/connect";
import { evaluations, notifications, userRoles, users } from "../db/schema";

export type Recipients = {
  /** Everyone holding any of these roles. */
  roles?: Role[];
  /** Unit officers whose unit is this one. */
  unitOfficersOf?: string | null;
  /** These people (blanks are ignored). */
  users?: (string | null | undefined)[];
};

export type NotifyInput = {
  kind: string;
  title: string;
  body?: string | null;
  reference?: string | null;
  href: string;
  to: Recipients;
};

/** Active, confirmed accounts matching the recipients, without the actor. */
export async function resolveRecipients(tx: DbOrTx, to: Recipients, exclude: string | null): Promise<string[]> {
  const conds: SQL[] = [];
  if (to.roles?.length) {
    conds.push(sql`exists (select 1 from ${userRoles} where ${userRoles.userId} = ${users.id} and ${inArray(userRoles.role, to.roles)})`);
  }
  if (to.unitOfficersOf) {
    conds.push(
      sql`(${users.unitId} = ${to.unitOfficersOf} and exists (select 1 from ${userRoles} where ${userRoles.userId} = ${users.id} and ${userRoles.role} = 'unit_officer'))`,
    );
  }
  const ids = [...new Set((to.users ?? []).filter((x): x is string => !!x))];
  if (ids.length) conds.push(inArray(users.id, ids));
  if (!conds.length) return [];
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), eq(users.pendingConfirmation, false), or(...conds)));
  return rows.map((r) => r.id).filter((id) => id !== exclude);
}

/** Write one notification per recipient. Returns how many were written. */
export async function notify(tx: Tx, actor: Actor | null, n: NotifyInput): Promise<number> {
  const to = await resolveRecipients(tx, n.to, actor?.id ?? null);
  if (!to.length) return 0;
  await tx.insert(notifications).values(
    to.map((userId) => ({
      userId,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      reference: n.reference ?? null,
      href: n.href,
      actorName: actor?.name ?? "System",
    })),
  );
  return to.length;
}

/** The three officers assigned to a submission's evaluation (any may be blank). */
export async function evaluationOfficers(tx: DbOrTx, submissionId: string) {
  const [ev] = await tx
    .select({ evaluator: evaluations.evaluatingOfficerId, supervisor: evaluations.reviewingSupervisorId, approver: evaluations.approvingOfficerId })
    .from(evaluations)
    .where(eq(evaluations.submissionId, submissionId));
  return { evaluator: ev?.evaluator ?? null, supervisor: ev?.supervisor ?? null, approver: ev?.approver ?? null };
}

export const submissionHref = (id: string, tab?: "evaluation" | "payments") => `/register/${id}${tab ? `?tab=${tab}` : ""}`;

// ---------------------------------------------------------------- reading (for the signed-in person only)


const toItem = (r: typeof notifications.$inferSelect): NotificationItem => ({
  id: r.id,
  title: r.title,
  body: r.body,
  reference: r.reference,
  href: r.href,
  actorName: r.actorName,
  createdAt: r.createdAt.toISOString(),
  read: !!r.readAt,
});

/** Unread count and the newest unread one: what the pulse needs. */
export async function unreadSummary(db: DbOrTx, userId: string): Promise<{ unread: number; newest: NotificationItem | null }> {
  const mine = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  const [[c], [n]] = await all(db, [
    () => db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(mine),
    () => db.select().from(notifications).where(mine).orderBy(desc(notifications.createdAt)).limit(1),
  ]);
  return { unread: c?.n ?? 0, newest: n ? toItem(n) : null };
}

export async function listNotifications(db: DbOrTx, userId: string, limit = 30): Promise<NotificationItem[]> {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
  return rows.map(toItem);
}

/** Mark the person's own notifications read: the given ones, or all of them. */
export async function markRead(db: DbOrTx, userId: string, ids: string[] | "all"): Promise<void> {
  const mine = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  const where = ids === "all" ? mine : ids.length ? and(mine, inArray(notifications.id, ids)) : null;
  if (!where) return;
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}

export async function getSoundPreference(db: DbOrTx, userId: string): Promise<boolean> {
  const [u] = await db.select({ s: users.notifySound }).from(users).where(eq(users.id, userId));
  return u?.s ?? true;
}

export async function setSoundPreference(db: DbOrTx, userId: string, on: boolean): Promise<void> {
  await db.update(users).set({ notifySound: on }).where(eq(users.id, userId));
}
