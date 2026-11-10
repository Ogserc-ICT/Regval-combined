import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import type { Actor } from "../../src/server/auth/actor";
import { addDays } from "../../src/domain/dates";
import { ST } from "../../src/domain/registration/types";
import { auditLog, submissions } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { runDailyReview } from "../../src/server/services/daily-review";
import { createSubmission } from "../../src/server/services/submissions/save";
import { lagosToday } from "../../src/server/time";
import { makeActor, resetTables, testDb } from "./helpers";

const db = testDb(10);
afterAll(() => db.$client.end());
beforeEach(() => resetTables(db));

async function failure(p: Promise<unknown>): Promise<ServiceError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return e;
    throw e;
  }
  throw new Error("expected a ServiceError");
}

const today = () => lagosToday();

describe("daily review (SPEC §26)", () => {
  async function submission(registration: Actor, name: string) {
    return createSubmission(
      db,
      registration,
      {
        filingType: "NEW",
        formFiled: "REG-01D",
        registeredName: name,
        dateSubmitted: today(),
        timeReceived: "00:05",
        submissionChannel: "By hand",
        principalLga: "Sagamu",
        primaryActivity: "GEN",
        installedCapacityMw: 5,
        licenceStatus: "Unlicensed",
        operatingOnEffectiveDate: "Y",
      },
      { confirmWarnings: true },
    );
  }

  it("acceptance: triggered twice on one Lagos date, it runs once", async () => {
    const results = await Promise.all([runDailyReview(db, "cron"), runDailyReview(db, "cron")]);
    expect(results.filter((r) => r.ran)).toHaveLength(1);
    expect(results.find((r) => !r.ran)).toMatchObject({ ran: false });
    const third = await runDailyReview(db, "cron");
    expect(third.ran).toBe(false);
    if (!third.ran) expect(third.reason).toContain("Already run");
  });

  it("makes past-determination new registrations provisional; lists overdue deficiency responses without lapsing", async () => {
    const admin = await makeActor(db, ["admin"]);
    const registration = await makeActor(db, ["registration"]);
    const a = await submission(registration, "Determination Passed Ltd");
    const b = await submission(registration, "Deficiency Late Ltd");
    await db.update(submissions).set({ status: ST.RECEIVED, dateSubmissionComplete: addDays(today(), -40) }).where(eq(submissions.id, a.id));
    // The notice was sent 30 days ago: its 14-day response period has passed.
    await db.update(submissions).set({ status: ST.DEFICIENCY, deficiencyNoticeDate: addDays(today(), -30) }).where(eq(submissions.id, b.id));
    const r = await runDailyReview(db, "manual", admin);
    expect(r.ran).toBe(true);
    if (!r.ran) return;
    expect(r.summary.provisional).toEqual([a.ackNo]);
    expect(r.summary.overdueDeficiency).toEqual([b.ackNo]);
    expect((await db.select().from(submissions).where(eq(submissions.id, a.id)))[0].status).toBe(ST.PROVISIONAL);
    expect((await db.select().from(submissions).where(eq(submissions.id, b.id)))[0].status).toBe(ST.DEFICIENCY);
    const [log] = await db.select().from(auditLog).where(and(eq(auditLog.reference, a.ackNo), eq(auditLog.action, "Provisional registration")));
    expect(log.detail).toContain("para 13(4)");
    const [daily] = await db.select().from(auditLog).where(eq(auditLog.action, "Daily review")).orderBy(desc(auditLog.seq)).limit(1);
    expect(daily.detail).toContain("Provisional today: 1");
  });

  it("a deficiency notice not yet sent is never overdue", async () => {
    const admin = await makeActor(db, ["admin"]);
    const registration = await makeActor(db, ["registration"]);
    const c = await submission(registration, "Not Sent Yet Ltd");
    await db.update(submissions).set({ status: ST.DEFICIENCY, deficiencyNoticeDate: null }).where(eq(submissions.id, c.id));
    const r = await runDailyReview(db, "manual", admin);
    if (!r.ran) throw new Error("expected a run");
    expect(r.summary.overdueDeficiency).toEqual([]);
  });

  it("only an admin can run it by hand", async () => {
    const registration = await makeActor(db, ["registration"]);
    expect((await failure(runDailyReview(db, "manual", registration))).status).toBe(403);
  });
});
