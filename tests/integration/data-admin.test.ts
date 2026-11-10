/**
 * Admin › Data management: clearing (up to a factory reset) and deleting single entries.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Actor } from "../../src/server/auth/actor";
import { auditLog, counters, holidays, listItems, notifications, payments, settings, signatories, submissions, userRoles, users } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { clearData, dataCounts, deleteOwnUse, deletePayment, deleteSubmission } from "../../src/server/services/data-admin";
import { createOwnUse } from "../../src/server/services/ownuse";
import { confirmPayment, recordPayment, reversePayment } from "../../src/server/services/payments";
import { seedHolidays } from "../../seed/seed";
import { saveSignatory } from "../../src/server/services/signatories";
import { getSettings, updateSettings } from "../../src/server/services/settings";
import { createSubmission } from "../../src/server/services/submissions/save";
import { dbErrorMessage, makeActor, resetTables, testDb } from "./helpers";

const db = testDb(10);
afterAll(() => db.$client.end());
beforeEach(() => resetTables(db));

const PW = "correct horse battery";

async function failure(p: Promise<unknown>): Promise<ServiceError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return e;
    throw e;
  }
  throw new Error("expected a ServiceError");
}

let n = 0;
const filing = () => ({
  filingType: "NEW",
  formFiled: "REG-01D",
  registeredName: `Clear Test ${++n} Ltd`,
  dateSubmitted: "2026-11-04",
  timeReceived: "10:00",
  submissionChannel: "By hand",
  principalLga: "Sagamu",
  primaryActivity: "GEN",
  installedCapacityMw: 5,
  licenceStatus: "OGSERC licence/permit",
  licences: [{ licenceNo: `CL/${n}`, expiryDate: "2030-01-01" }],
  operatingOnEffectiveDate: "Y",
});
const ownUse = () => ({ name: `Factory ${++n}`, dateFiled: "2026-11-04", timeReceived: "11:00", submissionChannel: "By hand", lga: "Ifo", units: [{ kw: 300 }] });
const serial = (no: string) => Number(no.split("/").pop());

async function fill(registration: Actor, finance: Actor) {
  const s = await createSubmission(db, registration, filing());
  const o = await createOwnUse(db, registration, ownUse());
  const pay = await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 1000 });
  void finance;
  return { s, o, pay };
}

describe("clear data", () => {
  it("admin only, with the admin's own password", async () => {
    const [admin, registration] = await Promise.all([makeActor(db, ["admin"]), makeActor(db, ["registration"])]);
    expect((await failure(clearData(db, registration, ["register"], PW))).status).toBe(403);
    expect((await failure(clearData(db, admin, ["register"], "wrong password"))).fieldErrors.password[0]).toMatch(/not your password/);
    expect((await failure(clearData(db, admin, [], PW))).reasons[0]).toMatch(/Tick at least one/);
  });

  it("clears the ticked registers only; a series restarts at 1 once nothing holds one of its numbers", async () => {
    const [admin, registration, finance] = await Promise.all([makeActor(db, ["admin"]), makeActor(db, ["registration"]), makeActor(db, ["finance"])]);
    const { s } = await fill(registration, finance);

    // Own-use only: the Register still holds ACKs and a PAY, so only OUN restarts.
    const first = await clearData(db, admin, ["ownUse"], PW);
    expect(first.cleared).toEqual({ ownUse: 1 });
    expect(first.restarted).toContain("OUN");
    expect(first.restarted).not.toContain("ACK");
    expect(first.restarted).not.toContain("PAY");
    expect((await dataCounts(db)).register).toBe(1);

    // Then the Register: its payments go with it, and ACK and PAY restart.
    const second = await clearData(db, admin, ["register"], PW);
    expect(second.cleared).toEqual({ register: 1 });
    expect(second.restarted).toEqual(expect.arrayContaining(["ACK", "PAY"]));
    expect(await db.select().from(payments)).toEqual([]);
    expect(await db.select().from(submissions).where(eq(submissions.id, s.id))).toEqual([]);
    const next = await createSubmission(db, registration, filing());
    expect(serial(next.ackNo)).toBe(1);

    const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "Data cleared")).orderBy(sql`${auditLog.seq} desc`).limit(1);
    expect(log.detail).toMatch(/Register entries: 1 removed/);
    expect(log.detail).toMatch(/restarted at 1: ACK.*PAY/);
  });

  it("factory reset: everything ticked; staff, roles and the audit log are kept; setup goes back to the defaults", async () => {
    const [admin, registration, finance] = await Promise.all([makeActor(db, ["admin"]), makeActor(db, ["registration"]), makeActor(db, ["finance"])]);
    await seedHolidays(db);
    await fill(registration, finance);
    await updateSettings(db, admin, { idleMinutes: 30, ackPrefix: "OGSERC/REG-ACK" });
    await saveSignatory(db, admin, null, { name: "Commissioner Person", designation: "Commissioner", role: "commissioner", active: true, confirmed: true });
    await db.insert(listItems).values({ listKey: "fuel", value: "Test fuel", sort: 99, active: true });
    await db.insert(holidays).values({ date: "2027-02-02", name: "Extra day", status: "State-declared" });
    const before = (await db.execute<{ n: number }>(sql`select count(*)::int as n from audit_log`)).rows[0].n;
    const staff = (await db.select().from(users)).length;
    const roles = (await db.select().from(userRoles)).length;

    const all = ["register", "ownUse", "notifications", "drafts", "dailyReview", "settings", "fees", "lists", "holidays", "signatories"];
    const r = await clearData(db, admin, all, PW);
    expect(r.restarted).toEqual(expect.arrayContaining(["ACK", "OUN", "PAY"]));
    expect(await db.select().from(counters)).toEqual([]);
    expect(await db.select().from(settings)).toEqual([]);
    expect((await getSettings(db)).idleMinutes).toBe(4);
    expect((await getSettings(db)).ackPrefix).toBe("OGSERC/ACK");
    expect((await db.select().from(listItems).where(eq(listItems.value, "Test fuel")))).toEqual([]);
    expect((await db.select().from(holidays).where(eq(holidays.date, "2027-02-02")))).toEqual([]);
    expect((await db.select().from(signatories)).map((g) => [g.name, g.role, g.confirmed])).toEqual([["Jide Onakoya", "chairman_ceo", false]]);
    expect(await db.select().from(notifications)).toEqual([]);

    expect((await db.select().from(users)).length).toBe(staff);
    expect((await db.select().from(userRoles)).length).toBe(roles);
    const after = (await db.execute<{ n: number }>(sql`select count(*)::int as n from audit_log`)).rows[0].n;
    expect(after).toBeGreaterThan(before);
    const [log] = await db.select().from(auditLog).orderBy(sql`${auditLog.seq} desc`).limit(1);
    expect(log.action).toBe("Factory reset");
  });

  it("outside these tools, the registers still refuse deletes", async () => {
    const registration = await makeActor(db, ["registration"]);
    await createSubmission(db, registration, filing());
    expect(await dbErrorMessage(db.delete(submissions))).toMatch(/cannot be deleted/);
    expect(await dbErrorMessage(db.delete(counters))).toMatch(/cannot be deleted/);
  });
});

describe("delete one entry", () => {
  it("a Register entry: typed ACK to confirm; refused while filings link to it; its number is never reused", async () => {
    const [admin, registration] = await Promise.all([makeActor(db, ["admin"]), makeActor(db, ["registration"])]);
    const parent = await createSubmission(db, registration, filing());
    const child = await createSubmission(db, registration, filing());
    await db.update(submissions).set({ linkedSubmissionId: parent.id }).where(eq(submissions.id, child.id));
    await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: parent.ackNo, amount: 500 });

    expect((await failure(deleteSubmission(db, registration, parent.id, parent.ackNo))).status).toBe(403);
    expect((await failure(deleteSubmission(db, admin, parent.id, "wrong"))).fieldErrors.confirmAck).toBeDefined();
    expect((await failure(deleteSubmission(db, admin, parent.id, parent.ackNo))).reasons[0]).toContain(`${child.ackNo} is an update or annual confirmation linked`);

    expect(await deleteSubmission(db, admin, child.id, child.ackNo.toLowerCase())).toBe(child.ackNo);
    expect(await deleteSubmission(db, admin, parent.id, parent.ackNo)).toBe(parent.ackNo);
    expect(await db.select().from(submissions)).toEqual([]);
    expect(await db.select().from(payments)).toEqual([]);
    const next = await createSubmission(db, registration, filing());
    expect(serial(next.ackNo)).toBe(serial(child.ackNo) + 1);
    const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "Submission deleted")).orderBy(sql`${auditLog.seq} desc`).limit(1);
    expect(log.reference).toBe(parent.ackNo);
    expect(log.detail).toMatch(/1 payment\(s\) deleted with it/);
  });

  it("an own-use notification, with its payments", async () => {
    const [admin, registration] = await Promise.all([makeActor(db, ["admin"]), makeActor(db, ["registration"])]);
    const o = await createOwnUse(db, registration, ownUse());
    await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: o.ounNo, amount: 500 });
    expect(await deleteOwnUse(db, admin, o.id, o.ackNo)).toBe(o.ackNo);
    expect((await dataCounts(db)).ownUse).toBe(0);
    expect(await db.select().from(payments)).toEqual([]);
  });

  it("a payment: pending ones can go; a confirmed one must be reversed first", async () => {
    const [admin, registration, finance] = await Promise.all([makeActor(db, ["admin"]), makeActor(db, ["registration"]), makeActor(db, ["finance"])]);
    const s = await createSubmission(db, registration, filing());
    const a = await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 100, rrr: "A1" });
    const b = await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 200, rrr: "B1" });
    const id = async (no: string) => (await db.select({ id: payments.id }).from(payments).where(eq(payments.payNo, no)))[0].id;
    expect(await deletePayment(db, admin, await id(a))).toBe(a);
    await confirmPayment(db, finance, await id(b), { verifiedWithBank: true });
    expect((await failure(deletePayment(db, admin, await id(b)))).reasons[0]).toMatch(/Reverse it first/);
    await reversePayment(db, finance, await id(b), "Recorded against the wrong filing");
    expect(await deletePayment(db, admin, await id(b))).toBe(b);
    expect(await db.select().from(payments)).toEqual([]);
  });
});
