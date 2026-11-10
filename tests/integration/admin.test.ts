import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { auditLog, feeSchedule, listItems } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { dashboardData } from "../../src/server/services/dashboard";
import { buildRegisterSheet, exportRegister, toCsv } from "../../src/server/services/exports";
import { addListItem, listEditable, updateActivity, updateFee, updateListItem } from "../../src/server/services/reference-admin";
import { getSettings } from "../../src/server/services/settings";
import { createSubmission } from "../../src/server/services/submissions/save";
import { loadSubmission } from "../../src/server/services/submissions/load";
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

const submission = (registry: Awaited<ReturnType<typeof makeActor>>, over = {}) =>
  createSubmission(
    db,
    registry,
    {
      filingType: "NEW",
      formFiled: "REG-01D",
      registeredName: "Fee Test Ltd",
      dateSubmitted: lagosToday(),
      timeReceived: "00:05",
      submissionChannel: "By hand",
      principalLga: "Sagamu",
      primaryActivity: "GEN",
      installedCapacityMw: 5,
      licenceStatus: "Unlicensed",
      operatingOnEffectiveDate: "Y",
      phone: "08021846578",
      ...over,
    },
    { confirmWarnings: true },
  );

describe("fee table (admin)", () => {
  it("a change is audited, sets 'fees revised on' and flags saved submissions instead of repricing them", async () => {
    const admin = await makeActor(db, ["admin"]);
    const registry = await makeActor(db, ["registration"]);
    const s = await submission(registry);
    const before = await loadSubmission(db, s.id);
    const [d] = await db.select().from(feeSchedule).where(eq(feeSchedule.category, before.a.categoryApplied!));
    try {
      const c = await updateFee(db, admin, d.category, { registrationFee: d.registrationFee + 100_000, lateInitial: d.lateInitial, lateDaily: d.lateDaily, lateCap: d.lateCap, description: d.description });
      expect(c[0]).toContain("registrationFee");
      expect((await getSettings(db)).feesRevisedOn).toBe(lagosToday());
      const after = await loadSubmission(db, s.id);
      expect(after.a.registrationFee).toBe(before.a.registrationFee);
      expect(after.a.flags.map((f) => f.code)).toContain("PRICING_OUT_OF_DATE");
      const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "Fee table changed")).orderBy(desc(auditLog.seq)).limit(1);
      expect(log.reference).toBe(`Category ${d.category}`);
    } finally {
      await db.update(feeSchedule).set({ registrationFee: d.registrationFee }).where(eq(feeSchedule.category, d.category));
    }
  });

  it("only an admin can change reference data", async () => {
    const registry = await makeActor(db, ["registration"]);
    expect((await failure(updateFee(db, registry, "A", { registrationFee: 1, lateInitial: 1, lateDaily: 1, lateCap: 1, description: "x" }))).status).toBe(403);
  });

  it("activity categories must be Schedule 3 categories", async () => {
    const admin = await makeActor(db, ["admin"]);
    const e = await failure(updateActivity(db, admin, "GEN", { cat10MwPlus: "Z", cat1To10Mw: "D", catBelow1Mw: "D", capacityBased: true, active: true }));
    expect(e.fieldErrors.cat10MwPlus).toBeDefined();
  });
});

describe("lists (admin)", () => {
  it("the submission channels the deemed-receipt rule relies on cannot be switched off; registry lists are gone", async () => {
    const admin = await makeActor(db, ["admin"]);
    expect((await failure(updateListItem(db, admin, "submission_channel", "Email", { value: "Email", active: false }))).reasons[0]).toContain("used by the rules");
    expect((await failure(addListItem(db, admin, "file_class", { value: "Legal" }))).status).toBe(404);
    expect(new Set((await listEditable(db)).map((r) => r.listKey))).toEqual(
      new Set(["lga", "registrant_type", "licence_status", "submission_channel", "payment_channel", "payment_purpose", "fuel", "refusal_ground"]),
    );
    const v = `Test fuel ${Date.now()}`;
    await addListItem(db, admin, "fuel", { value: v });
    await updateListItem(db, admin, "fuel", v, { value: v, active: false });
    const [row] = await db.select().from(listItems).where(and(eq(listItems.listKey, "fuel"), eq(listItems.value, v)));
    expect(row.active).toBe(false);
  });
});

describe("register exports", () => {
  it("CSV keeps the phone's leading zero and neutralises formulas; admin only; audited", async () => {
    const admin = await makeActor(db, ["admin"]);
    const registry = await makeActor(db, ["registration"]);
    await submission(registry, { registeredName: "=HYPERLINK(\"x\")" });
    const sheet = await buildRegisterSheet(db, "register");
    const csv = toCsv(sheet);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("08021846578");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect((await failure(exportRegister(db, registry, "register", "csv"))).status).toBe(403);
    const x = await exportRegister(db, admin, "register", "xlsx");
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe("PK");
    expect(x.filename).toMatch(/^OGSERC-Register-submissions-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "Register exported")).orderBy(desc(auditLog.seq)).limit(1);
    expect(log.detail).toContain("1 row(s) as XLSX");
  });

  it("every register builds", async () => {
    for (const key of ["register", "payments", "own-use", "audit"] as const) {
      const sheet = await buildRegisterSheet(db, key);
      expect(sheet.columns.length).toBeGreaterThan(3);
      for (const r of sheet.rows) expect(r).toHaveLength(sheet.columns.length);
    }
  });
});

describe("dashboard", () => {
  it("counts registrations only", async () => {
    const registry = await makeActor(db, ["registration"]);
    await submission(registry);
    const d = await dashboardData(db, registry);
    expect(d.registration.total).toBe(1);
    expect(d.registration.awaitingPayment).toBe(1);
    expect("registry" in d).toBe(false);
    expect(d.registration.byCategory.reduce((n, c) => n + c.submissions, 0)).toBe(1);
    expect(d.queues.awaitingPayment).toHaveLength(1);
  });
});
