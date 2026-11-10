/**
 * Idle sign-out on the server and kept form work (docs/PLAN.md §11f, 8c).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { auditLog, sessions } from "../../src/server/db/schema";
import { DRAFT_TTL_MS, deleteDraft, draftPaths, getDraft, saveDraft } from "../../src/server/services/drafts";
import { checkIdle, IDLE_GRACE_MS, idleMinutes, touchSession } from "../../src/server/services/idle";
import { updateSettings } from "../../src/server/services/settings";
import { makeActor, resetTables, testDb } from "./helpers";

const db = testDb(10);
afterAll(() => db.$client.end());
beforeEach(() => resetTables(db));

async function sessionFor(userId: string, lastActivityAt: Date) {
  const [s] = await db
    .insert(sessions)
    .values({ userId, token: randomUUID(), expiresAt: new Date(Date.now() + 12 * 3600_000), lastActivityAt })
    .returning({ id: sessions.id });
  return s.id;
}

describe("idle sessions", () => {
  it("defaults to 4 minutes and follows the admin setting", async () => {
    expect(await idleMinutes(db)).toBe(4);
    const admin = await makeActor(db, ["admin"]);
    await updateSettings(db, admin, { idleMinutes: 10 });
    expect(await idleMinutes(db)).toBe(10);
    await expect(updateSettings(db, admin, { idleMinutes: 0 })).rejects.toThrow();
  });

  it("a session idle past the limit (plus grace) is ended once and audited; activity keeps it", async () => {
    const u = await makeActor(db, ["registration"]);
    const t0 = new Date("2026-11-10T09:00:00Z");
    const id = await sessionFor(u.id, t0);
    const limit = 4 * 60_000 + IDLE_GRACE_MS;

    expect(await checkIdle(db, id, new Date(t0.getTime() + limit))).toBe("active");
    await touchSession(db, id, new Date(t0.getTime() + limit));
    // Activity moved the clock: still active well after the first deadline
    expect(await checkIdle(db, id, new Date(t0.getTime() + limit + 60_000))).toBe("active");

    const late = new Date(t0.getTime() + 2 * limit + 1);
    const [a, b] = await Promise.all([checkIdle(db, id, late), checkIdle(db, id, late)]);
    // Both refuse it; the slower one may find it already ended ("missing").
    expect([a, b]).toContain("expired");
    expect([a, b].every((x) => x === "expired" || x === "missing")).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.id, id))).toEqual([]);
    const logs = await db.select().from(auditLog).where(and(eq(auditLog.entityId, u.id), eq(auditLog.action, "Signed out: inactive")));
    expect(logs).toHaveLength(1);
    expect(await checkIdle(db, id, late)).toBe("missing");
  });
});

describe("kept form work", () => {
  const draft = (v: string) => ({ savedAt: new Date().toISOString(), forms: [{ key: "#f", fields: [{ name: "registeredName", i: 0, value: v }] }] });

  it("one per person and page, for that person only, gone after a day", async () => {
    const [a, b] = await Promise.all([makeActor(db, ["registration"]), makeActor(db, ["registration"])]);
    const now = new Date();
    await saveDraft(db, a.id, "/register/new", draft("First"), now);
    await saveDraft(db, a.id, "/register/new", draft("Second"), now);
    expect((await getDraft(db, a.id, "/register/new", now))?.forms[0].fields[0].value).toBe("Second");
    expect(await getDraft(db, b.id, "/register/new", now)).toBeNull();
    expect(await draftPaths(db, a.id, now)).toEqual(["/register/new"]);
    expect(await draftPaths(db, b.id, now)).toEqual([]);

    const tomorrow = new Date(now.getTime() + DRAFT_TTL_MS + 1);
    expect(await getDraft(db, a.id, "/register/new", tomorrow)).toBeNull();
    expect(await draftPaths(db, a.id, tomorrow)).toEqual([]);

    await deleteDraft(db, b.id, "/register/new"); // b cannot delete a's
    expect(await getDraft(db, a.id, "/register/new", now)).not.toBeNull();
    await deleteDraft(db, a.id, "/register/new");
    expect(await getDraft(db, a.id, "/register/new", now)).toBeNull();
  });
});
