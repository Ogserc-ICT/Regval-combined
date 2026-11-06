import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { addDays } from "../../src/domain/dates";
import { ST } from "../../src/domain/registration/types";
import { auditLog, correspondenceTypes, emailMessages, inwardItems, submissions, units } from "../../src/server/db/schema";
import { memoryOutbox } from "../../src/server/email/transport";
import { ServiceError } from "../../src/server/errors";
import { renderDailyRegister, renderPending } from "../../src/server/pdf/registers";
import { renderSlip, slipData, SLIP_FOOTER } from "../../src/server/pdf/slip";
import { runDailyReview } from "../../src/server/services/daily-review";
import { resendAcknowledgement, sendEmailNow } from "../../src/server/services/email";
import { routeInward, saveInward, type InwardInput } from "../../src/server/services/registry/inward";
import { updateSettings } from "../../src/server/services/settings";
import { createSubmission } from "../../src/server/services/submissions/save";
import { lagosToday } from "../../src/server/time";
import { makeActor, resetTables, testDb } from "./helpers";

process.env.EMAIL_PROVIDER = "memory";
delete process.env.BLOB_READ_WRITE_TOKEN;

const db = testDb(10);
afterAll(() => db.$client.end());
beforeEach(async () => {
  await resetTables(db);
  memoryOutbox.length = 0;
});

async function failure(p: Promise<unknown>): Promise<ServiceError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return e;
    throw e;
  }
  throw new Error("expected a ServiceError");
}

const typeId = async (name: string) => (await db.select({ id: correspondenceTypes.id }).from(correspondenceTypes).where(eq(correspondenceTypes.name, name)))[0].id;
const unitId = async (name: string) => (await db.select({ id: units.id }).from(units).where(eq(units.name, name)))[0].id;
const today = () => lagosToday();
const inward = async (over: Partial<InwardInput> = {}): Promise<InwardInput> => ({
  receivedDate: today(),
  receivedTime: "00:05",
  mode: "Hand delivery",
  // Tariff and Rates unit: its division (EMPR) has empr@ogserc.org.ng
  correspondenceTypeId: await typeId("Tariff application / review"),
  sender: "Ogun Power Ltd",
  senderCategory: "Registrant / licensee",
  subject: "Tariff review",
  ackIssuedVia: "Email",
  ...over,
});

async function people(mode: "Send" | "Preview" | "Off") {
  const admin = await makeActor(db, ["admin"]);
  await updateSettings(db, admin, { ackEmailMode: mode });
  return { admin, registry: await makeActor(db, ["registry"]), router: await makeActor(db, ["router"]) };
}

describe("acknowledgement email (SPEC §25, [G9])", () => {
  it("Send: emails the unit's division with the slip attached and records it", async () => {
    const p = await people("Send");
    const s = await saveInward(db, p.registry, await inward());
    expect(s.warnings).toEqual([]);
    expect(memoryOutbox).toHaveLength(1);
    const m = memoryOutbox[0];
    expect(m.to).toEqual(["empr@ogserc.org.ng"]);
    expect(m.subject).toBe(`Acknowledgement ${s.ackNo} - Tariff application / review from Ogun Power Ltd`);
    expect(m.text).toContain("Routing, file reference and handling will follow from the Secretary to the Commission / Head of Administration.");
    expect(m.attachments?.[0].filename).toMatch(/^Acknowledgement-OGSERC-ACK-\d{4}-\d{5}\.pdf$/);
    expect(m.attachments?.[0].content.subarray(0, 4).toString()).toBe("%PDF");
    const [row] = await db.select().from(inwardItems).where(eq(inwardItems.id, s.id));
    expect(row.ackEmailedTo).toBe("empr@ogserc.org.ng");
    const [log] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, s.id), eq(auditLog.action, "Acknowledgement emailed")));
    expect(log).toBeDefined();
  });

  it("Preview: keeps the email for review; sending it later delivers it", async () => {
    const p = await people("Preview");
    const s = await saveInward(db, p.registry, await inward());
    expect(s.warnings[0]).toContain("ready for review");
    expect(memoryOutbox).toHaveLength(0);
    const [m] = await db.select().from(emailMessages).where(eq(emailMessages.entityId, s.id));
    expect(m.status).toBe("preview");
    expect(await sendEmailNow(db, p.registry, m.id)).toBeNull();
    expect(memoryOutbox).toHaveLength(1);
    expect((await db.select().from(emailMessages).where(eq(emailMessages.id, m.id)))[0].status).toBe("sent");
  });

  it("Off: nothing is queued and nothing is warned", async () => {
    const p = await people("Off");
    const s = await saveInward(db, p.registry, await inward({ correspondenceTypeId: await typeId("REG-01 Registration (new)") }));
    expect(s.warnings.join()).not.toContain("not emailed");
    expect(await db.select().from(emailMessages)).toEqual([]);
  });

  it("acceptance: a unit with no email shows a warning and logs 'Not emailed: no address'", async () => {
    const p = await people("Send");
    const s = await saveInward(db, p.registry, await inward({ correspondenceTypeId: await typeId("REG-01 Registration (new)") }));
    expect(s.warnings[0]).toContain("no email address");
    const [log] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, s.id), eq(auditLog.action, "Not emailed: no address")));
    expect(log.detail).toContain("unit Licensing unit");
    expect(memoryOutbox).toHaveLength(0);
  });

  it("a provider failure is recorded and never undoes the save", async () => {
    const p = await people("Send");
    await db.update(units).set({ email: "fail@ogserc.org.ng" }).where(eq(units.name, "Licensing unit"));
    try {
      const s = await saveInward(db, p.registry, await inward({ correspondenceTypeId: await typeId("REG-01 Registration (new)") }));
      expect(s.warnings[0]).toContain("Simulated provider failure");
      const [row] = await db.select().from(inwardItems).where(eq(inwardItems.id, s.id));
      expect(row.ackNo).toBe(s.ackNo);
      const [m] = await db.select().from(emailMessages).where(eq(emailMessages.entityId, s.id));
      expect(m.status).toBe("failed");
      const [log] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, s.id), eq(auditLog.action, "Email failed")));
      expect(log).toBeDefined();
    } finally {
      await db.update(units).set({ email: null }).where(eq(units.name, "Licensing unit"));
    }
  });

  it("resend asks to confirm when the acknowledgement was emailed before", async () => {
    const p = await people("Send");
    const s = await saveInward(db, p.registry, await inward());
    expect((await failure(resendAcknowledgement(db, p.registry, s.id))).kind).toBe("confirm");
    await resendAcknowledgement(db, p.registry, s.id, { confirm: true });
    expect(memoryOutbox).toHaveLength(2);
  });
});

describe("routing email (SPEC §25)", () => {
  it("emails a newly routed unit, but not addresses already emailed", async () => {
    const p = await people("Send");
    const s = await saveInward(db, p.registry, await inward());
    expect(memoryOutbox).toHaveLength(1);
    // Same unit as the acknowledgement: every address already emailed
    await routeInward(db, p.router, s.id, { actionRequired: "Reply required" });
    expect(memoryOutbox).toHaveLength(1);
    // Re-route to ICT (it@ogserc.org.ng)
    await routeInward(db, p.router, s.id, { unitId: await unitId("ICT unit"), actionRequired: "Action required", priority: "Urgent", actionOfficer: "K. Ade" });
    expect(memoryOutbox).toHaveLength(2);
    const m = memoryOutbox[1];
    expect(m.to).toEqual(["it@ogserc.org.ng"]);
    expect(m.subject).toBe(`Routed to ICT unit: ${s.ackNo} - Ogun Power Ltd`);
    expect(m.text).toContain("Priority: Urgent");
    expect(m.text).toContain("Action officer: K. Ade");
    expect(m.attachments ?? []).toEqual([]);
  });
});

describe("daily review (SPEC §26)", () => {
  async function submission(registry: Awaited<ReturnType<typeof people>>["registry"], name: string) {
    return createSubmission(
      db,
      registry,
      { filingType: "NEW", formFiled: "REG-01D", registeredName: name, dateSubmitted: today(), principalLga: "Sagamu", primaryActivity: "GEN", installedCapacityMw: 5, licenceStatus: "Unlicensed", operatingOnEffectiveDate: "Y" },
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
    const p = await people("Off");
    const a = await submission(p.registry, "Determination Passed Ltd");
    const b = await submission(p.registry, "Deficiency Late Ltd");
    await db.update(submissions).set({ status: ST.RECEIVED, dateSubmissionComplete: addDays(today(), -40) }).where(eq(submissions.id, a.id));
    await db.update(submissions).set({ status: ST.DEFICIENCY, deficiencyNoticeDate: addDays(today(), -30) }).where(eq(submissions.id, b.id));
    const r = await runDailyReview(db, "manual", p.admin);
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

  it("only an admin can run it by hand", async () => {
    const registry = await makeActor(db, ["registry"]);
    expect((await failure(runDailyReview(db, "manual", registry))).status).toBe(403);
  });
});

describe("PDFs (SPEC §24)", () => {
  it("slip carries the para 10(3) wording for filings, the footer and the Secretary", async () => {
    const p = await people("Off");
    const s = await saveInward(db, p.registry, await inward({ correspondenceTypeId: await typeId("REG-01 Registration (new)"), amountShown: 25_000_000 }));
    const x = await slipData(db, s.id);
    expect(x.para103).toBe(true);
    expect(x.forwardedTo).toBe("Licensing unit");
    const pdf = await renderSlip(db, s.id);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(SLIP_FOOTER).toContain("para 10(3)");
  });

  it("Daily Register and Pending actions render", async () => {
    const p = await people("Off");
    await saveInward(db, p.registry, await inward());
    expect((await renderDailyRegister(db, today(), "Test Officer")).subarray(0, 4).toString()).toBe("%PDF");
    expect((await renderPending(db, null, "Test Officer")).subarray(0, 4).toString()).toBe("%PDF");
  });
});
