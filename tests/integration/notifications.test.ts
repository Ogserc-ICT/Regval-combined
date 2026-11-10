/**
 * Notifications (docs/PLAN.md §11f, 8b): the next people in line hear about
 * each action, the person who acted never does, and nobody can read or clear
 * anyone else's.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { Actor } from "../../src/server/auth/actor";
import { correspondenceTypes, notifications, units, users } from "../../src/server/db/schema";
import { listNotifications, markRead, resolveRecipients, unreadSummary } from "../../src/server/services/notifications";
import { confirmPayment, recordPayment, rejectPayment } from "../../src/server/services/payments";
import { logFrontDesk } from "../../src/server/services/registry/frontdesk";
import { closeInward, routeInward, saveInward } from "../../src/server/services/registry/inward";
import { createSubmission } from "../../src/server/services/submissions/save";
import { assignOfficers } from "../../src/server/services/submissions/workflow";
import { lagosToday } from "../../src/server/time";
import { makeActor, resetTables, testDb } from "./helpers";

const db = testDb(10);
afterAll(() => db.$client.end());
beforeEach(() => resetTables(db));

const today = () => lagosToday();
const typeId = async (name: string) => (await db.select({ id: correspondenceTypes.id }).from(correspondenceTypes).where(eq(correspondenceTypes.name, name)))[0].id;
const unitId = async (name: string) => (await db.select({ id: units.id }).from(units).where(eq(units.name, name)))[0].id;

async function inUnit(actor: Actor, unit: string): Promise<Actor> {
  await db.update(users).set({ unitId: unit }).where(eq(users.id, actor.id));
  return { ...actor, unitId: unit };
}

const titlesFor = async (a: Actor) => (await listNotifications(db, a.id)).map((n) => n.title);

let n = 0;
const submission = () => ({
  filingType: "NEW" as const,
  formFiled: "REG-01D",
  registeredName: `Notify Power ${++n} Ltd`,
  dateSubmitted: "2026-11-04",
  principalLga: "Sagamu",
  primaryActivity: "GEN",
  installedCapacityMw: 5,
  licenceStatus: "OGSERC licence/permit",
  licences: [{ licenceNo: `NT/${n}`, expiryDate: "2030-01-01" }],
  operatingOnEffectiveDate: "Y" as const,
});

describe("recipients", () => {
  it("roles, unit officers and named people; never the actor, inactive or unconfirmed accounts", async () => {
    const ict = await unitId("ICT unit");
    const other = await unitId("Internal Audit unit");
    const [r1, r2, uo, uoOther, plain] = await Promise.all([
      makeActor(db, ["registry"]),
      makeActor(db, ["registry"]),
      makeActor(db, ["unit_officer"]),
      makeActor(db, ["unit_officer"]),
      makeActor(db, ["viewer"]),
    ]);
    await inUnit(uo, ict);
    await inUnit(uoOther, other);
    const off = await makeActor(db, ["registry"]);
    await db.update(users).set({ active: false }).where(eq(users.id, off.id));
    const seeded = await makeActor(db, ["registry"]);
    await db.update(users).set({ pendingConfirmation: true }).where(eq(users.id, seeded.id));

    expect(await resolveRecipients(db, { roles: ["registry"] }, r1.id)).toEqual([r2.id]);
    expect(await resolveRecipients(db, { unitOfficersOf: ict }, null)).toEqual([uo.id]);
    expect(await resolveRecipients(db, { users: [plain.id, null, plain.id] }, null)).toEqual([plain.id]);
    expect(await resolveRecipients(db, {}, null)).toEqual([]);
  });
});

describe("registry hand-offs", () => {
  it("front desk → Registry; New Inward → Routers; routing → that unit; a unit closing → Registry", async () => {
    const ict = await unitId("ICT unit");
    const [frontDesk, registry, registry2, router, uo, uoElsewhere] = await Promise.all([
      makeActor(db, ["front_desk"]),
      makeActor(db, ["registry"]),
      makeActor(db, ["registry"]),
      makeActor(db, ["router"]),
      makeActor(db, ["unit_officer"]),
      makeActor(db, ["unit_officer"]),
    ]);
    const unitOfficer = await inUnit(uo, ict);
    await inUnit(uoElsewhere, await unitId("Internal Audit unit"));

    const fd = await logFrontDesk(db, frontDesk, { receivedDate: today(), receivedTime: "00:01", sender: "Walk-in", subject: "Letter" });
    expect(await titlesFor(registry)).toEqual([`New at the front desk: ${fd.fdNo}`]);
    expect(await titlesFor(frontDesk)).toEqual([]);

    const item = await saveInward(db, registry, {
      receivedDate: today(),
      receivedTime: "00:05",
      mode: "Hand delivery",
      correspondenceTypeId: await typeId("Tariff application / review"),
      sender: "Ogun Power Ltd",
      senderCategory: "Registrant / licensee",
      subject: "Tariff review",
      ackIssuedVia: "Printed slip",
    });
    expect(await titlesFor(router)).toEqual([`To route: ${item.ackNo}`]);
    expect(await titlesFor(registry)).toEqual([`New at the front desk: ${fd.fdNo}`]); // not told about their own save

    await routeInward(db, router, item.id, { unitId: ict, actionRequired: "Reply required" });
    const [routed] = await listNotifications(db, unitOfficer.id);
    expect(routed.title).toBe(`Routed to ICT unit: ${item.ackNo}`);
    expect(routed.href).toBe(`/inward/${item.id}`);
    expect(await titlesFor(uoElsewhere)).toEqual([]);

    await closeInward(db, unitOfficer, item.id, { confirm: true });
    expect((await titlesFor(registry2))[0]).toBe(`Closed by ICT unit: ${item.ackNo}`);
  });
});

describe("payments and evaluation hand-offs", () => {
  it("recorded → Finance; rejected → the recorder; released → the assigned evaluator; assigned → each officer", async () => {
    const [registry, finance1, finance2, evaluator, supervisor, approver] = await Promise.all([
      makeActor(db, ["registry"]),
      makeActor(db, ["finance"]),
      makeActor(db, ["finance"]),
      makeActor(db, ["evaluator"]),
      makeActor(db, ["supervisor"]),
      makeActor(db, ["approver"]),
    ]);
    const s = await createSubmission(db, registry, submission());

    await assignOfficers(db, supervisor, s.id, { evaluatingOfficerId: evaluator.id, reviewingSupervisorId: supervisor.id, approvingOfficerId: approver.id });
    expect(await titlesFor(evaluator)).toEqual([`You are the evaluating officer: ${s.ackNo}`]);
    expect(await titlesFor(approver)).toEqual([`You are the approving officer: ${s.ackNo}`]);
    expect(await titlesFor(supervisor)).toEqual([]); // assigned themselves

    const bad = await recordPayment(db, registry, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 100, rrr: `BAD${n}` });
    expect(await titlesFor(finance1)).toEqual([`Payment to confirm: ${bad}`]);
    const [badRow] = (await db.execute<{ id: string }>(sql`select id from payments where pay_no = ${bad}`)).rows;
    await rejectPayment(db, finance1, badRow.id, "Not in the bank statement");
    expect((await titlesFor(registry))[0]).toBe(`Payment rejected: ${bad}`);

    const good = await recordPayment(db, registry, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 30_000_000, rrr: `GOOD${n}` });
    const [goodRow] = (await db.execute<{ id: string }>(sql`select id from payments where pay_no = ${good}`)).rows;
    await confirmPayment(db, finance2, goodRow.id, { verifiedWithBank: true });
    const [released] = await listNotifications(db, evaluator.id);
    expect(released.title).toBe(`Ready to evaluate: ${s.ackNo}`);
    expect(released.href).toBe(`/register/${s.id}?tab=evaluation`);
  });
});

describe("reading", () => {
  it("unread count and newest; marking read only touches the person's own", async () => {
    const [frontDesk, a, b] = await Promise.all([makeActor(db, ["front_desk"]), makeActor(db, ["registry"]), makeActor(db, ["registry"])]);
    await logFrontDesk(db, frontDesk, { receivedDate: today(), receivedTime: "00:01", sender: "One", subject: "First" });
    const second = await logFrontDesk(db, frontDesk, { receivedDate: today(), receivedTime: "00:02", sender: "Two", subject: "Second" });

    const s = await unreadSummary(db, a.id);
    expect(s.unread).toBe(2);
    expect(s.newest?.title).toBe(`New at the front desk: ${second.fdNo}`);

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
