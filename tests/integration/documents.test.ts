/**
 * Phase 10: the four registration documents. Certificate serials, the deficiency notice
 * frozen at issue, drafts, signatories, and each document rendering from real records.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { eq, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { createElement } from "react";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AUTO_CHECKS, DECISION_CHECKS } from "../../src/domain/registration/checks";
import { deficiencyNotices, signatories, submissions } from "../../src/server/db/schema";
import { AcknowledgementLetter } from "../../src/server/pdf/acknowledgement-letter";
import { Certificate } from "../../src/server/pdf/certificate";
import { registerFonts } from "../../src/server/pdf/common";
import { DeficiencyNotice } from "../../src/server/pdf/deficiency-notice";
import { Eval01 } from "../../src/server/pdf/eval-01";
import { acknowledgementData, certificateData, deficiencyData, evaluationData } from "../../src/server/services/letters";
import { confirmPayment, recordPayment } from "../../src/server/services/payments";
import { saveSignatory } from "../../src/server/services/signatories";
import { createSubmission, type SubmissionInput } from "../../src/server/services/submissions/save";
import { loadSubmission } from "../../src/server/services/submissions/load";
import {
  answerChecks,
  approve,
  assignOfficers,
  confirmCategory,
  issueDeficiency,
  markComplete,
  recordDeficiencySent,
  setDocument,
} from "../../src/server/services/submissions/workflow";
import { ServiceError } from "../../src/server/errors";
import { dbErrorMessage, makeActor, resetTables, testDb } from "./helpers";

const db = testDb(10);
afterAll(() => db.$client.end());
beforeEach(() => resetTables(db));
registerFonts();

let n = 0;
const input = (over: Partial<SubmissionInput> = {}): SubmissionInput => ({
  filingType: "NEW",
  formFiled: "REG-01D",
  registeredName: `Doc Power ${++n} Ltd`,
  dateSubmitted: "2026-11-04",
  timeReceived: "10:00",
  submissionChannel: "By hand",
  registrantType: "Company",
  cacNo: `RC${700000 + n}`,
  registeredAddress: "2 Sample Street, Abeokuta",
  complianceOfficer: "A. Compliance",
  principalLga: "Sagamu",
  primaryActivity: "GEN",
  installedCapacityMw: 5,
  licenceStatus: "OGSERC licence/permit",
  licences: [{ licenceNo: `OG/${n}`, expiryDate: "2030-01-01" }],
  phone: "08021846578",
  operatingOnEffectiveDate: "Y",
  ...over,
});

async function released() {
  const [registry, finance, evaluator, supervisor, approver, admin] = await Promise.all([
    makeActor(db, ["registration"], "Reg Officer"),
    makeActor(db, ["finance"]),
    makeActor(db, ["evaluator"], "Eve Evaluator"),
    makeActor(db, ["supervisor"], "Sam Supervisor"),
    makeActor(db, ["approver"], "Ann Approver"),
    makeActor(db, ["admin"]),
  ]);
  const s = await createSubmission(db, registry, input());
  await recordPayment(db, registry, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 30_000_000 });
  const [p] = (await db.execute<{ id: string }>(sql`select id from payments where reference = ${s.ackNo}`)).rows;
  await confirmPayment(db, finance, p.id, { verifiedWithBank: true });
  await assignOfficers(db, supervisor, s.id, { evaluatingOfficerId: evaluator.id, reviewingSupervisorId: supervisor.id, approvingOfficerId: approver.id });
  return { registry, evaluator, supervisor, approver, admin, s };
}

async function registered(t: Awaited<ReturnType<typeof released>>) {
  const manual = Object.fromEntries(DECISION_CHECKS.filter((c) => !AUTO_CHECKS.has(c)).map((c) => [c, "Y"]));
  await answerChecks(db, t.evaluator, t.s.id, manual);
  const l0 = await loadSubmission(db, t.s.id);
  for (const d of l0.a.documents.items.filter((i) => !i.automatic)) await setDocument(db, t.registry, t.s.id, d.key, "Y");
  await confirmCategory(db, t.evaluator, t.s.id, "D", null);
  await markComplete(db, t.evaluator, t.s.id);
  await approve(db, t.approver, t.s.id);
}

async function sigs(admin: { id: string }, commissionerConfirmed = true) {
  const a = admin as Parameters<typeof saveSignatory>[1];
  await saveSignatory(db, a, null, { name: "Jide Chair", designation: "Chairman / Chief Executive Officer", role: "chairman_ceo", active: true, confirmed: true });
  await saveSignatory(db, a, null, { name: "Femi Commissioner", designation: "Commissioner", role: "commissioner", active: true, confirmed: commissionerConfirmed });
}

async function pdfPages(el: ReturnType<typeof createElement>): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- renderToBuffer wants a <Document> element
  const buf = await renderToBuffer(el as any);
  expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  return (buf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

describe("CERT-01 certificate (Q28d, Q28e)", () => {
  it("approval issues a certificate serial from one series that never resets; the database locks it", async () => {
    const t1 = await released();
    await sigs(t1.admin);
    await registered(t1);
    const t2 = await released();
    await registered(t2);
    const [a] = await db.select().from(submissions).where(eq(submissions.id, t1.s.id));
    const [b] = await db.select().from(submissions).where(eq(submissions.id, t2.s.id));
    expect(a.certificateSerial).toBeGreaterThan(0);
    expect(b.certificateSerial).toBe(a.certificateSerial! + 1);
    expect((await db.execute<{ year: number }>(sql`select year from counters where series = 'CERT'`)).rows).toEqual([{ year: 0 }]);
    expect(await dbErrorMessage(db.execute(sql`update submissions set certificate_serial = 999 where id = ${t1.s.id}`))).toMatch(/certificate_serial is locked/);
  });

  it("prints as a draft while a signatory is unconfirmed, and in full once confirmed", async () => {
    const t = await released();
    await sigs(t.admin, false);
    await registered(t);
    const draft = await certificateData(db, t.s.id);
    expect(draft.draftReason).toMatch(/Femi Commissioner \(Commissioner\) not confirmed/);
    expect(draft.commissioner?.name).toBe("Femi Commissioner");
    expect(draft.serial).toMatch(/^\d{4}$/);
    await db.update(signatories).set({ confirmed: true }).where(eq(signatories.role, "commissioner"));
    const x = await certificateData(db, t.s.id);
    expect(x.draftReason).toBeNull();
    expect(x.voidReason).toBeNull();
    expect(x.registrationNo).toMatch(/^OGSERC\/REG\/2026\/D-GEN\/\d{4}$/);
    expect(x.chairman?.name).toBe("Jide Chair");
    const qr = await QRCode.toBuffer("https://example.invalid/register/x", { margin: 0, width: 240 });
    expect(await pdfPages(createElement(Certificate, { x, qr }))).toBe(1);
  }, 60_000);

  it("is not available before approval", async () => {
    const t = await released();
    await expect(certificateData(db, t.s.id)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("deficiency notice (para 13(1)(b))", () => {
  it("freezes what it says at issue; a draft until sent, then dated the day it was sent", async () => {
    const t = await released();
    await answerChecks(db, t.evaluator, t.s.id, { "2.2": "N" }, "Shareholding does not match the CAC report.");
    await issueDeficiency(db, t.supervisor, t.s.id);
    const [notice] = await db.select().from(deficiencyNotices).where(eq(deficiencyNotices.submissionId, t.s.id));
    expect(notice.contents?.checks.some((c) => c.endsWith("(check 2.2)"))).toBe(true);
    expect(notice.contents?.documents.length).toBeGreaterThan(0);
    expect(notice.contents?.remarks).toBe("Shareholding does not match the CAC report.");
    expect(notice.contents?.issuedByName).toBe("Sam Supervisor");

    const draft = await deficiencyData(db, t.s.id);
    expect(draft.draft).toBe(true);

    // A later document entry does not change the notice as issued.
    const before = notice.contents!.documents.length;
    const l = await loadSubmission(db, t.s.id);
    const doc = l.a.documents.items.find((i) => !i.automatic && i.value !== "Y")!;
    await setDocument(db, t.registry, t.s.id, doc.key, "Y");
    expect((await deficiencyData(db, t.s.id)).contents.documents.length).toBe(before);

    const sentOn = l.ctx.today;
    await recordDeficiencySent(db, t.registry, t.s.id, sentOn);
    const sent = await deficiencyData(db, t.s.id);
    expect(sent.draft).toBe(false);
    expect(sent.date).toBe(sentOn);
    const [after] = await db.select().from(deficiencyNotices).where(eq(deficiencyNotices.id, notice.id));
    expect(sent.responseDue).toBe(after.responseDue);
    expect(await pdfPages(createElement(DeficiencyNotice, { x: sent }))).toBe(1);
    expect(await dbErrorMessage(db.execute(sql`update deficiency_notices set contents = '{}'::jsonb where id = ${notice.id}`))).toMatch(/contents is locked/);
  }, 60_000);
});

describe("acknowledgement letter and EVAL-01", () => {
  it("render from real records; the letter is signed by the evaluating officer, else the officer printing it", async () => {
    const t = await released();
    const ack = await acknowledgementData(db, t.s.id, "Printing Officer");
    expect(ack.ackNo).toBe(t.s.ackNo);
    expect(ack.signedBy).toBe("Eve Evaluator");
    expect(ack.attention).toBe("A. Compliance");
    expect(ack.head.email).toBe("registration@ogserc.org.ng");
    expect(await pdfPages(createElement(AcknowledgementLetter, { x: ack }))).toBeGreaterThanOrEqual(1);

    const bare = await createSubmission(db, t.registry, input());
    expect((await acknowledgementData(db, bare.id, "Printing Officer")).signedBy).toBe("Printing Officer");

    const ev = await evaluationData(db, t.s.id);
    expect(ev.evaluator).toBe("Eve Evaluator");
    expect(ev.stages.map((s) => s.title)[0]).toMatch(/^STAGE 1/);
    expect(ev.stages.flatMap((s) => s.checks)).toHaveLength(DECISION_CHECKS.length);
    expect(ev.postApproval.map((c) => c.id)).toEqual(["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7"]);
    expect(await pdfPages(createElement(Eval01, { x: ev }))).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
