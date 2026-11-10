/**
 * Idle sign-out on the server (docs/PLAN.md §11f, 8c). The browser signs a
 * person out after `idleMinutes` without activity; this is the server's own
 * check, so a session left open (or a browser that never runs the timer)
 * cannot outlive the limit. Only the browser's activity ping moves
 * `last_activity_at`; page loads, polling and actions only check it.
 */
import { eq } from "drizzle-orm";
import { resolveSettings } from "@/domain/settings";
import { writeAudit } from "../audit";
import type { Db, DbOrTx } from "../db/connect";
import { sessions, settings, users } from "../db/schema";

/**
 * The server allows this much beyond the limit: the browser reports activity
 * at most every 20 seconds and warns 30 seconds before it signs out, so the
 * browser always acts first and saves the person's work while it still can.
 */
export const IDLE_GRACE_MS = 60_000;

export async function idleMinutes(db: DbOrTx): Promise<number> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "idleMinutes"));
  return resolveSettings(row ? { idleMinutes: row.value } : {}).idleMinutes;
}

export type IdleCheck = "active" | "expired" | "missing";

/** Ends the session (and audits it) when it has been idle past the limit. */
export async function checkIdle(db: Db, sessionId: string, now = new Date()): Promise<IdleCheck> {
  const [s] = await db
    .select({ last: sessions.lastActivityAt, userId: sessions.userId, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId));
  if (!s) return "missing";
  const minutes = await idleMinutes(db);
  if (now.getTime() - s.last.getTime() <= minutes * 60_000 + IDLE_GRACE_MS) return "active";
  await db.transaction(async (tx) => {
    const gone = await tx.delete(sessions).where(eq(sessions.id, sessionId)).returning({ id: sessions.id });
    // Two requests can find the same idle session; only the one that ended it audits.
    if (gone.length) {
      await writeAudit(tx, {
        actor: { id: s.userId, name: s.name },
        action: "Signed out: inactive",
        module: "auth",
        entityType: "user",
        entityId: s.userId,
        detail: `No activity for more than ${minutes} minute(s); session ended by the server`,
      });
    }
  });
  return "expired";
}

/** Record real activity on the session (the browser's ping). */
export async function touchSession(db: DbOrTx, sessionId: string, now = new Date()): Promise<void> {
  await db.update(sessions).set({ lastActivityAt: now }).where(eq(sessions.id, sessionId));
}
