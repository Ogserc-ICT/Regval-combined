/**
 * Notifications (docs/PLAN.md §11f, 8b): the next people in line hear about
 * each action, the person who acted never does, and nobody can read or clear
 * anyone else's.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { Actor } from "../../src/server/auth/actor";
import { notifications, users } from "../../src/server/db/schema";
import { listNotifications, markRead, resolveRecipients, unreadSummary } from "../../src/server/services/notifications";
import { confirmPayment, recordPayment, rejectPayment } from "../../src/server/services/payments";
import { createSubmission } from "../../src/server/services/submissions/save";
import { assignOfficers, issueDeficiency } from "../../src/server/services/submissions/workflow";
import { makeActor, resetTables, testDb } from "./helpers";

const db = testDb(10);
afterAll(() => db.$client.end());
beforeEach(() => resetTables(db));

const titlesFor = async (a: Actor) => (await listNotifications(db, a.id)).map((n) => n.title);
const payId = async (payNo: string) => (await db.execute<{ id: string }>(sql`select id from payments where pay_no = ${payNo}`)).rows[0].id;

let n = 0;
const submission = () => ({
  filingType: "NEW" as const,
  formFiled: "REG-01D",
  registeredName: `Notify Power ${++n} Ltd`,
  dateSubmitted: "2026-11-04",
  timeReceived: "10:00",
  submissionChannel: "By hand",
  principalLga: "Sagamu",
  primaryActivity: "GEN",
  installedCapacityMw: 5,
  licenceStatus: "OGSERC licence/permit",
  licences: [{ licenceNo: `NT/${n}`, expiryDate: "2030-01-01" }],
  operatingOnEffectiveDate: "Y" as const,
});

describe("recipients", () => {
  it("roles and named people; never the actor, inactive or unconfirmed accounts", async () => {
    const [r1, r2, plain] = await Promise.all([makeActor(db, ["registration"]), makeActor(db, ["registration"]), makeActor(db, ["viewer"])]);
    const off = await makeActor(db, ["registration"]);
    await db.update(users).set({ active: false }).where(eq(users.id, off.id));
    const seeded = await makeActor(db, ["registration"]);
    await db.update(users).set({ pendingConfirmation: true }).where(eq(users.id, seeded.id));

    expect(await resolveRecipients(db, { roles: ["registration"] }, r1.id)).toEqual([r2.id]);
    expect(await resolveRecipients(db, { users: [plain.id, null, plain.id] }, null)).toEqual([plain.id]);
    expect(await resolveRecipients(db, {}, null)).toEqual([]);
  });
});

describe("hand-offs", () => {
  it("recorded → Finance; rejected → the recorder; released → the assigned evaluator; assigned → each officer", async () => {
    const [registration, finance1, finance2, evaluator, supervisor, approver] = await Promise.all([
      makeActor(db, ["registration"]),
      makeActor(db, ["finance"]),
      makeActor(db, ["finance"]),
      makeActor(db, ["evaluator"]),
      makeActor(db, ["supervisor"]),
      makeActor(db, ["approver"]),
    ]);
    const s = await createSubmission(db, registration, submission());

    await assignOfficers(db, supervisor, s.id, { evaluatingOfficerId: evaluator.id, reviewingSupervisorId: supervisor.id, approvingOfficerId: approver.id });
    expect(await titlesFor(evaluator)).toEqual([`You are the evaluating officer: ${s.ackNo}`]);
    expect(await titlesFor(approver)).toEqual([`You are the approving officer: ${s.ackNo}`]);
    expect(await titlesFor(supervisor)).toEqual([]); // assigned themselves

    const bad = await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 100, rrr: `BAD${n}` });
    expect(await titlesFor(finance1)).toEqual([`Payment to confirm: ${bad}`]);
    await rejectPayment(db, finance1, await payId(bad), "Not in the bank statement");
    expect((await titlesFor(registration))[0]).toBe(`Payment rejected: ${bad}`);

    const good = await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 30_000_000, rrr: `GOOD${n}` });
    await confirmPayment(db, finance2, await payId(good), { verifiedWithBank: true });
    const [released] = await listNotifications(db, evaluator.id);
    expect(released.title).toBe(`Ready to evaluate: ${s.ackNo}`);
    expect(released.href).toBe(`/register/${s.id}?tab=evaluation`);
  });

  it("a deficiency notice goes to the Registration officers to send, and to the evaluator", async () => {
    const [registration, registration2, finance, evaluator, supervisor, approver] = await Promise.all([
      makeActor(db, ["registration"]),
      makeActor(db, ["registration"]),
      makeActor(db, ["finance"]),
      makeActor(db, ["evaluator"]),
      makeActor(db, ["supervisor"]),
      makeActor(db, ["approver"]),
    ]);
    const s = await createSubmission(db, registration, submission());
    await assignOfficers(db, supervisor, s.id, { evaluatingOfficerId: evaluator.id, reviewingSupervisorId: supervisor.id, approvingOfficerId: approver.id });
    const pay = await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 30_000_000, rrr: `DEF${n}` });
    await confirmPayment(db, finance, await payId(pay), { verifiedWithBank: true });
    await issueDeficiency(db, supervisor, s.id, { confirm: true });
    for (const who of [registration, registration2, evaluator]) {
      expect((await titlesFor(who))[0]).toMatch(/^Deficiency notice OGSERC\/DEF\/\d{4}\/\d{5} to send: /);
    }
  });
});

describe("reading", () => {
  it("unread count and newest; marking read only touches the person's own", async () => {
    const [registration, a, b] = await Promise.all([makeActor(db, ["registration"]), makeActor(db, ["finance"]), makeActor(db, ["finance"])]);
    const s = await createSubmission(db, registration, submission());
    await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 100, rrr: `R1-${n}` });
    const second = await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 200, rrr: `R2-${n}` });

    const sum = await unreadSummary(db, a.id);
    expect(sum.unread).toBe(2);
    expect(sum.newest?.title).toBe(`Payment to confirm: ${second}`);

    // b cannot clear a's notifications, even by id
    const aIds = (await listNotifications(db, a.id)).map((x) => x.id);
    await markRead(db, b.id, aIds);
    await markRead(db, b.id, "all");
    expect((await unreadSummary(db, a.id)).unread).toBe(2);
    expect((await unreadSummary(db, b.id)).unread).toBe(0);

    await markRead(db, a.id, [aIds[0]]);
    expect((await unreadSummary(db, a.id)).unread).toBe(1);
    await markRead(db, a.id, "all");
    expect((await unreadSummary(db, a.id)).unread).toBe(0);
    const left = await db.select().from(notifications).where(and(eq(notifications.userId, a.id)));
    expect(left.every((x) => x.readAt)).toBe(true);
  });
});
