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
import { PaymentReceipt } from "../../src/server/pdf/payment-receipt";
import { acknowledgementData, certificateData, deficiencyData, evaluationData, receiptData } from "../../src/server/services/letters";
import { confirmPayment, recordPayment, rejectPayment, reversePayment } from "../../src/server/services/payments";
import { saveSignatory } from "../../src/server/services/signatories";
import { removeSignature, saveSignature } from "../../src/server/services/signatures";
import { removeUser } from "../../src/server/services/users";
import type { SignatureStore } from "../../src/server/blob";
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

async function sigs(admin: { id: string }, secretaryConfirmed = true) {
  const a = admin as Parameters<typeof saveSignatory>[1];
  await saveSignatory(db, a, null, { name: "Jide Chair", designation: "Chairman / Chief Executive Officer", role: "chairman_ceo", active: true, confirmed: true });
  await saveSignatory(db, a, null, { name: "Toyin Secretary", designation: "Secretary to the Commission", role: "secretary", active: true, confirmed: secretaryConfirmed });
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
    expect(draft.draftReason).toMatch(/Toyin Secretary \(Secretary to the Commission\) not confirmed/);
    expect(draft.secretary?.name).toBe("Toyin Secretary");
    expect(draft.serial).toMatch(/^\d{4}$/);
    await db.update(signatories).set({ confirmed: true }).where(eq(signatories.role, "secretary"));
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
    const ack = await acknowledgementData(db, t.s.id, t.admin);
    expect(ack.ackNo).toBe(t.s.ackNo);
    expect(ack.signedBy).toBe("Eve Evaluator");
    expect(ack.attention).toBe("A. Compliance");
    expect(ack.head.email).toBe("registration@ogserc.org.ng");
    expect(await pdfPages(createElement(AcknowledgementLetter, { x: ack }))).toBeGreaterThanOrEqual(1);

    const bare = await createSubmission(db, t.registry, input());
    expect((await acknowledgementData(db, bare.id, t.admin)).signedBy).toBe(t.admin.name);

    const ev = await evaluationData(db, t.s.id);
    expect(ev.evaluator).toBe("Eve Evaluator");
    expect(ev.stages.map((s) => s.title)[0]).toMatch(/^STAGE 1/);
    expect(ev.stages.flatMap((s) => s.checks)).toHaveLength(DECISION_CHECKS.length);
    expect(ev.postApproval.map((c) => c.id)).toEqual(["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7"]);
    expect(await pdfPages(createElement(Eval01, { x: ev }))).toBeGreaterThanOrEqual(2);
  }, 60_000);
});

function fakeSignatureStore() {
  const files = new Map<string, Buffer>();
  const store: SignatureStore = {
    save: async (p, b) => void files.set(p, Buffer.from(b)),
    read: async (p) => files.get(p) ?? null,
    remove: async (ps) => ps.forEach((p) => files.delete(p)),
  };
  return { files, store };
}

describe("staff e-signatures", () => {
  it("only an admin uploads; only a PNG is accepted; replacing one removes the old file", async () => {
    const t = await released();
    const { files, store } = fakeSignatureStore();
    const png = await QRCode.toBuffer("sig", { margin: 0, width: 200 });
    await expect(saveSignature(db, t.registry, t.evaluator.id, png, store)).rejects.toBeInstanceOf(ServiceError);
    const notPng = await saveSignature(db, t.admin, t.evaluator.id, Buffer.from("%PDF-1.7 not an image"), store).catch((e) => e as ServiceError);
    expect(notPng).toBeInstanceOf(ServiceError);
    await saveSignature(db, t.admin, t.evaluator.id, png, store);
    expect(files.size).toBe(1);
    await saveSignature(db, t.admin, t.evaluator.id, png, store);
    expect(files.size).toBe(1);
    await removeSignature(db, t.admin, t.evaluator.id, store);
    expect(files.size).toBe(0);
  }, 60_000);

  it("stamp the letter at once, the notice once sent, EVAL-01 once decided; a deleted person's never", async () => {
    const t = await released();
    const { files, store } = fakeSignatureStore();
    const png = await QRCode.toBuffer("sig", { margin: 0, width: 200 });
    for (const who of [t.evaluator, t.supervisor, t.approver]) await saveSignature(db, t.admin, who.id, png, store);

    expect((await acknowledgementData(db, t.s.id, t.admin, store)).signature).not.toBeNull();
    const ev0 = await evaluationData(db, t.s.id, store);
    expect(ev0.signatures).toEqual({ evaluator: null, supervisor: null, approver: null });

    await answerChecks(db, t.evaluator, t.s.id, { "2.2": "N" });
    await issueDeficiency(db, t.supervisor, t.s.id);
    expect((await deficiencyData(db, t.s.id, null, store)).signature).toBeNull();
    await recordDeficiencySent(db, t.registry, t.s.id, (await loadSubmission(db, t.s.id)).ctx.today);
    const sent = await deficiencyData(db, t.s.id, null, store);
    expect(sent.signature).not.toBeNull();
    expect(await pdfPages(createElement(DeficiencyNotice, { x: sent }))).toBe(1);

    const t2 = await released();
    for (const who of [t2.evaluator, t2.supervisor, t2.approver]) await saveSignature(db, t2.admin, who.id, png, store);
    await sigs(t2.admin);
    await registered(t2);
    const ev = await evaluationData(db, t2.s.id, store);
    expect(ev.signatures.evaluator && ev.signatures.supervisor && ev.signatures.approver).toBeTruthy();
    expect(await pdfPages(createElement(Eval01, { x: ev }))).toBeLessThanOrEqual(3);

    // The letter's signer falls back to the officer printing it; once deleted, theirs is gone.
    const leaver = await makeActor(db, ["registration"], "Lee Leaver");
    await saveSignature(db, t2.admin, leaver.id, png, store);
    const bare = await createSubmission(db, t2.registry, input());
    expect((await acknowledgementData(db, bare.id, leaver, store)).signature).not.toBeNull();
    const before = files.size;
    await removeUser(db, t2.admin, leaver.id, store);
    expect(files.size).toBe(before - 1);
    expect((await acknowledgementData(db, bare.id, leaver, store)).signature).toBeNull();
  }, 120_000);
});

describe("payment receipt", () => {
  it("prints only for a confirmed payment; signed by a confirmed Head of Finance with the linked e-signature; marked when reversed", async () => {
    const t = await released();
    const finance = await makeActor(db, ["finance"], "Fin Checker");
    const { store } = fakeSignatureStore();
    const qr = await QRCode.toBuffer("x", { margin: 0, width: 120 });

    const [confirmed] = (await db.execute<{ id: string }>(sql`select id from payments where reference = ${t.s.ackNo}`)).rows;
    await recordPayment(db, t.registry, { dateReceived: "2026-11-05", reference: t.s.ackNo, amount: 5_000 });
    const [pending] = (await db.execute<{ id: string }>(sql`select id from payments where reference = ${t.s.ackNo} and finance_status = 'Pending'`)).rows;
    await expect(receiptData(db, pending.id, store)).rejects.toBeInstanceOf(ServiceError);
    await rejectPayment(db, finance, pending.id, "No such credit");
    await expect(receiptData(db, pending.id, store)).rejects.toBeInstanceOf(ServiceError);

    // No Head of Finance yet: a draft.
    const draft = await receiptData(db, confirmed.id, store);
    expect(draft).toMatchObject({ payer: expect.stringMatching(/^Doc Power/), reference: t.s.ackNo, amount: 30_000_000, signature: null, reversedReason: null });
    expect(draft.draftReason).toMatch(/No Head of Finance/);
    expect(draft.position?.paid).toBe(30_000_000);

    // A linked staff account must exist.
    const bad = await saveSignatory(db, t.admin, null, { name: "Head F", designation: "Head of Finance", role: "head_of_finance", active: true, confirmed: true, userId: "00000000-0000-0000-0000-000000000000" }).catch((e) => e);
    expect(bad).toBeInstanceOf(ServiceError);

    const head = await makeActor(db, ["finance"], "Head F");
    await saveSignature(db, t.admin, head.id, await QRCode.toBuffer("sig", { margin: 0, width: 200 }), store);
    const sid = await saveSignatory(db, t.admin, null, { name: "Head F", designation: "Head of Finance", role: "head_of_finance", active: true, confirmed: false, userId: head.id });
    const unconfirmed = await receiptData(db, confirmed.id, store);
    expect(unconfirmed.draftReason).toMatch(/not confirmed/);
    expect(unconfirmed.signature).toBeNull();

    await saveSignatory(db, t.admin, sid, { name: "Head F", designation: "Head of Finance", role: "head_of_finance", active: true, confirmed: true, userId: head.id });
    const signed = await receiptData(db, confirmed.id, store);
    expect(signed.draftReason).toBeNull();
    expect(signed.headOfFinance?.name).toBe("Head F");
    expect(signed.signature).not.toBeNull();
    expect(await pdfPages(createElement(PaymentReceipt, { x: signed, qr }))).toBe(1);

    await reversePayment(db, finance, confirmed.id, "Bounced");
    expect((await receiptData(db, confirmed.id, store)).reversedReason).toBe("Bounced");
  }, 120_000);
});
