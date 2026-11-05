import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { DECISION_CHECKS, AUTO_CHECKS } from "../../src/domain/registration/checks";
import { inwardItems, submissions } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { issueNumber } from "../../src/server/numbering";
import { createOwnUse } from "../../src/server/services/ownuse";
import { confirmPayment, recordPayment, rejectPayment, reversePayment } from "../../src/server/services/payments";
import { createSubmission, updateSubmission, type SubmissionInput } from "../../src/server/services/submissions/save";
import { assessMany, loadSubmission } from "../../src/server/services/submissions/load";
import { saveSignatory } from "../../src/server/services/signatories";
import { updateSettings } from "../../src/server/services/settings";
import {
  answerChecks,
  approve,
  assignOfficers,
  cancel,
  confirmCategory,
  issueDeficiency,
  lapse,
  markComplete,
  recalculateAllOpen,
  setDocument,
  setFlagOverrideReason,
  setShowCauseDate,
  refuse,
} from "../../src/server/services/submissions/workflow";
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

let n = 0;
const input = (over: Partial<SubmissionInput> = {}): SubmissionInput => ({
  filingType: "NEW",
  formFiled: "REG-01D",
  registeredName: `Test Power ${++n} Ltd`,
  dateSubmitted: "2026-11-04",
  submissionChannel: "By hand",
  registrantType: "Company",
  cacNo: `RC${900000 + n}`,
  principalLga: "Sagamu",
  primaryActivity: "GEN",
  installedCapacityMw: 5,
  licenceStatus: "OGSERC licence/permit",
  licences: [{ licenceNo: `OG/${n}`, expiryDate: "2030-01-01" }],
  phone: "08021846578",
  operatingOnEffectiveDate: "Y",
  ...over,
});

async function team() {
  const [registry, finance1, finance2, evaluator, supervisor, approver, admin] = await Promise.all([
    makeActor(db, ["registry"]),
    makeActor(db, ["finance"]),
    makeActor(db, ["finance"]),
    makeActor(db, ["evaluator"]),
    makeActor(db, ["supervisor"]),
    makeActor(db, ["approver"]),
    makeActor(db, ["admin"]),
  ]);
  return { registry, finance1, finance2, evaluator, supervisor, approver, admin };
}

async function signatoriesReady(admin: Awaited<ReturnType<typeof team>>["admin"]) {
  await saveSignatory(db, admin, null, { name: "Chair Person", designation: "Chairman", role: "chairman_ceo", active: true, confirmed: true });
  await saveSignatory(db, admin, null, { name: "Commissioner Person", designation: "Commissioner", role: "commissioner", active: true, confirmed: true });
}

describe("one ACK series [G12] (acceptance)", () => {
  it("a registry inward item, a direct Register entry and an own-use notification draw from the same ACK series", async () => {
    const { registry } = await team();
    const year = 2026;
    const before = await db.transaction((tx) => issueNumber(tx, "ACK", { year })); // e.g. New Inward in Phase 3
    const s = await createSubmission(db, registry, input());
    const o = await createOwnUse(db, registry, { name: "Factory Ltd", dateFiled: "2026-11-04", lga: "Ifo", units: [{ kw: 300 }] });
    const serial = (ack: string) => Number(ack.split("/").pop());
    expect(serial(s.ackNo)).toBe(before.serial + 1);
    expect(serial(o.ackNo)).toBe(before.serial + 2);
    const inward = await db.select().from(inwardItems).where(eq(inwardItems.ackNo, s.ackNo));
    expect(inward[0]).toMatchObject({ source: "register_direct", deemedReceiptDate: "2026-11-04" });
  });
});

describe("save submission (SPEC §6)", () => {
  it("only a Registry officer can save (403)", async () => {
    const { finance1 } = await team();
    expect((await failure(createSubmission(db, finance1, input()))).status).toBe(403);
  });

  it("lists every problem at once (422), phone without its zero is rejected", async () => {
    const { registry } = await team();
    const e = await failure(
      createSubmission(db, registry, input({ formFiled: "REG-01I", principalLga: "Lagos", phone: "8021846578", operatingOnEffectiveDate: "N", cacNo: "12345" })),
    );
    expect(e.status).toBe(422);
    expect(Object.keys(e.fieldErrors).sort()).toEqual(["cacNo", "formFiled", "phone", "plannedStartDate", "principalLga"]);
    expect(e.fieldErrors.phone[0]).toContain("08021846578");
  });

  it("freezes the pricing, keeps the phone's leading zero, and waits for payment", async () => {
    const { registry } = await team();
    const s = await createSubmission(db, registry, input());
    const l = await loadSubmission(db, s.id);
    expect(l.row.status).toBe("Acknowledged - Awaiting Payment");
    expect(l.row.phone).toBe("08021846578");
    expect(l.row.pricedCategory).toBe("D");
    expect(l.row.pricedFee).toBe(30_000_000);
    expect(l.row.pricedDeadline).toBe("2026-12-21");
    expect(l.a.nextAction).toBe("Await payment of ₦300,000, then Finance confirmation");
  });

  it("a duplicate CAC on another registration needs confirmation", async () => {
    const { registry } = await team();
    await createSubmission(db, registry, input({ cacNo: "RC777" }));
    const e = await failure(createSubmission(db, registry, input({ cacNo: "RC777" })));
    expect(e.kind).toBe("confirm");
    expect(e.reasons[0]).toMatch(/para 11\(4\)/);
    await createSubmission(db, registry, input({ cacNo: "RC777" }), { confirmWarnings: true });
  });

  it("edits are audited old → new and do not change the frozen pricing", async () => {
    const { registry } = await team();
    const s = await createSubmission(db, registry, input());
    const changes = await updateSubmission(db, registry, s.id, input({ registeredName: "Renamed Ltd", installedCapacityMw: 12 }));
    expect(changes).toContain("Installed capacity (MW): 5 → 12");
    const l = await loadSubmission(db, s.id);
    expect(l.row.pricedCategory).toBe("D");
    expect(l.a.flags.map((f) => f.code)).toContain("PRICING_OUT_OF_DATE");
  });
});

describe("payments and the Finance gate (SPEC §11)", () => {
  it("acceptance: a Finance officer gets 403 confirming a payment they recorded", async () => {
    const { finance1 } = await team();
    const { registry } = await team();
    const s = await createSubmission(db, registry, input());
    await recordPayment(db, finance1, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 30_000_000, rrr: `RRR${n}` });
    const [p] = await db.execute<{ id: string }>(sql`select id from payments where reference = ${s.ackNo}`).then((r) => r.rows);
    const e = await failure(confirmPayment(db, finance1, p.id, { verifiedWithBank: true }));
    expect(e.status).toBe(403);
    expect((await failure(rejectPayment(db, finance1, p.id, "wrong"))).status).toBe(403);
  });

  it("confirmation by another Finance officer releases the submission; decisions are final", async () => {
    const { registry, finance1, finance2 } = await team();
    const s = await createSubmission(db, registry, input());
    await recordPayment(db, registry, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 30_000_000, rrr: `RRR-A${n}` });
    const [p] = (await db.execute<{ id: string }>(sql`select id from payments where reference = ${s.ackNo}`)).rows;
    expect((await failure(confirmPayment(db, finance1, p.id, { verifiedWithBank: false }))).reasons[0]).toMatch(/bank \/ Remita/);
    expect(await confirmPayment(db, finance1, p.id, { verifiedWithBank: true })).toMatch(/released for evaluation/);
    const l = await loadSubmission(db, s.id);
    expect(l.row.status).toBe("Received - Under Review");
    expect(l.row.releasedOn).toBeTruthy();
    expect((await failure(confirmPayment(db, finance2, p.id, { verifiedWithBank: true }))).reasons[0]).toMatch(/final/);
    await reversePayment(db, finance2, p.id, "Bounced");
    const after = await loadSubmission(db, s.id);
    expect(after.row.status).toBe("Received - Under Review"); // stays released
    expect(after.a.gateCleared).toBe(false);
  });

  it("a duplicate RRR needs confirmation", async () => {
    const { registry } = await team();
    const s = await createSubmission(db, registry, input());
    await recordPayment(db, registry, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 100, rrr: "DUP-RRR-1" });
    expect((await failure(recordPayment(db, registry, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 100, rrr: "dup-rrr-1" }))).kind).toBe("confirm");
  });
});

describe("evaluation and decisions (SPEC §12, §13)", () => {
  async function released() {
    const t = await team();
    const s = await createSubmission(db, t.registry, input());
    await recordPayment(db, t.registry, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 30_000_000 });
    const [p] = (await db.execute<{ id: string }>(sql`select id from payments where reference = ${s.ackNo}`)).rows;
    await confirmPayment(db, t.finance1, p.id, { verifiedWithBank: true });
    return { ...t, s };
  }

  it("evaluation actions are blocked (and audited) until Finance confirms payment", async () => {
    const t = await team();
    const s = await createSubmission(db, t.registry, input());
    await assignOfficers(db, t.supervisor, s.id, { evaluatingOfficerId: t.evaluator.id, reviewingSupervisorId: t.supervisor.id, approvingOfficerId: t.approver.id });
    const e = await failure(markComplete(db, t.evaluator, s.id));
    expect(e.reasons[0]).toMatch(/^Mark complete is blocked. Payment not yet confirmed by Finance/);
    const [a] = (await db.execute<{ action: string }>(sql`select action from audit_log where reference = ${s.ackNo} order by seq desc limit 1`)).rows;
    expect(a.action).toBe("Blocked - awaiting Finance confirmation");
  });

  it("[G8] officers must be four different people, holding their roles", async () => {
    const t = await released();
    const e = await failure(assignOfficers(db, t.supervisor, t.s.id, { evaluatingOfficerId: t.registry.id, reviewingSupervisorId: t.supervisor.id, approvingOfficerId: t.approver.id }));
    expect(e.fieldErrors.evaluatingOfficerId).toBeDefined();
    const both = await makeActor(db, ["evaluator", "approver"]);
    const e2 = await failure(assignOfficers(db, t.supervisor, t.s.id, { evaluatingOfficerId: both.id, reviewingSupervisorId: t.supervisor.id, approvingOfficerId: both.id }));
    expect(e2.reasons).toContain("The approving officer cannot be the evaluating officer");
    const creatorEval = await makeActor(db, ["registry", "evaluator"]);
    const s2 = await createSubmission(db, creatorEval, input());
    const e3 = await failure(assignOfficers(db, t.supervisor, s2.id, { evaluatingOfficerId: creatorEval.id }));
    expect(e3.reasons).toContain("The evaluating officer cannot be the user who created the submission");
  });

  it("full path: checks, documents, category, complete, approve → registration number", async () => {
    const t = await released();
    await assignOfficers(db, t.supervisor, t.s.id, { evaluatingOfficerId: t.evaluator.id, reviewingSupervisorId: t.supervisor.id, approvingOfficerId: t.approver.id });
    const manual = Object.fromEntries(DECISION_CHECKS.filter((c) => !AUTO_CHECKS.has(c)).map((c) => [c, "Y"]));
    await answerChecks(db, t.evaluator, t.s.id, manual);
    expect((await failure(answerChecks(db, t.registry, t.s.id, manual))).status).toBe(403);
    const l0 = await loadSubmission(db, t.s.id);
    for (const d of l0.a.documents.items.filter((i) => !i.automatic)) await setDocument(db, t.registry, t.s.id, d.key, "Y");
    await confirmCategory(db, t.evaluator, t.s.id, "D", null);
    expect(await markComplete(db, t.evaluator, t.s.id)).toMatch(/Determination due/);

    // acceptance: refused while the Commissioner signatory is empty, with the reason
    const e = await failure(approve(db, t.approver, t.s.id));
    expect(e.reasons).toEqual(["Certificate signatory not set: Chairman / CEO and Commissioner. An admin must add it under Admin › Signatories."]);
    await saveSignatory(db, t.admin, null, { name: "Chair Person", designation: "Chairman", role: "chairman_ceo", active: true, confirmed: true });
    expect((await failure(approve(db, t.approver, t.s.id))).reasons).toEqual([
      "Certificate signatory not set: Commissioner. An admin must add it under Admin › Signatories.",
    ]);
    await saveSignatory(db, t.admin, null, { name: "Commissioner Person", designation: "Commissioner", role: "commissioner", active: true, confirmed: true });
    expect((await failure(approve(db, t.supervisor, t.s.id))).status).toBe(403); // not an approver
    const msg = await approve(db, t.approver, t.s.id);
    expect(msg).toMatch(/^Registered as OGSERC\/REG\/2026\/D-GEN\/\d{4}\.$/);
    const l = await loadSubmission(db, t.s.id);
    expect(l.row.status).toBe("Registered");
    expect(l.evaluation?.finalDecision).toBe("Register (13(1)(a))");
    await expect(db.execute(sql`update submissions set registration_no = 'X' where id = ${t.s.id}`)).rejects.toThrow();
    await expect(db.execute(sql`delete from submissions where id = ${t.s.id}`)).rejects.toThrow();

    // An update linked to it: no fee, released at once, changes applied on approval.
    const u = await createSubmission(db, t.registry, input({ filingType: "UPDATE", linkedRegistrationNo: l.row.registrationNo!, registeredName: "New Name Ltd", cacNo: l.row.cacNo }));
    const lu = await loadSubmission(db, u.id);
    expect(lu.row.status).toBe("Received - Under Review");
    expect(lu.a.totalDue).toBe(0);
  });

  it("deficiency notice: numbered, never restarts the clock (Q7), lapses only after the response period", async () => {
    const t = await released();
    await assignOfficers(db, t.supervisor, t.s.id, { evaluatingOfficerId: t.evaluator.id, reviewingSupervisorId: t.supervisor.id, approvingOfficerId: t.approver.id });
    expect((await failure(issueDeficiency(db, t.evaluator, t.s.id))).status).toBe(403);
    expect(await issueDeficiency(db, t.supervisor, t.s.id)).toMatch(/^Deficiency notice OGSERC\/DEF\/2026\/\d{5} recorded; response due/);
    expect((await failure(issueDeficiency(db, t.supervisor, t.s.id))).reasons[0]).toMatch(/already outstanding/);
    const e = await failure(lapse(db, t.approver, t.s.id));
    expect(e.reasons[0]).toMatch(/response period runs until/);
  });

  it("refuse needs the show-cause period; cancel is admin-only", async () => {
    const t = await released();
    await assignOfficers(db, t.supervisor, t.s.id, { evaluatingOfficerId: t.evaluator.id, reviewingSupervisorId: t.supervisor.id, approvingOfficerId: t.approver.id });
    const e = await failure(refuse(db, t.approver, t.s.id, "False or misleading information", null));
    expect(e.reasons).toContain("No show-cause notice date recorded");
    await setShowCauseDate(db, t.approver, t.s.id, "2026-10-01");
    expect(await refuse(db, t.approver, t.s.id, "False or misleading information", "Fake licence")).toMatch(/refused/);
    const s2 = await createSubmission(db, t.registry, input());
    expect((await failure(cancel(db, t.registry, s2.id, "duplicate"))).status).toBe(403);
    expect(await cancel(db, t.admin, s2.id, "Filed twice")).toMatch(/cancelled/);
  });

  it("unresolved data flags need a written reason before approval (Q11)", async () => {
    const t = await released();
    await setFlagOverrideReason(db, t.approver, t.s.id, "x").catch(() => undefined); // not assigned yet → refused
    await assignOfficers(db, t.supervisor, t.s.id, { evaluatingOfficerId: t.evaluator.id, reviewingSupervisorId: t.supervisor.id, approvingOfficerId: t.approver.id });
    await setFlagOverrideReason(db, t.approver, t.s.id, "Checked with the applicant");
    const l = await loadSubmission(db, t.s.id);
    expect(l.evaluation?.flagOverrideReason).toBe("Checked with the applicant");
  });
});

describe("Effective Date change and recalculation (Q6, acceptance check 1)", () => {
  it("saved submissions are flagged; one admin click with a reason moves them, audited on each", async () => {
    const t = await team();
    await signatoriesReady(t.admin);
    const s = await createSubmission(db, t.registry, input());
    await updateSettings(db, t.admin, { effectiveDate: "2026-11-02" });
    const flagged = await loadSubmission(db, s.id);
    expect(flagged.a.deadline).toBe("2026-12-21");
    expect(flagged.a.flags.find((f) => f.code === "PRICING_OUT_OF_DATE")).toBeDefined();
    expect((await failure(recalculateAllOpen(db, t.registry, "gazette"))).status).toBe(403);
    const r = await recalculateAllOpen(db, t.admin, "Effective Date gazetted");
    expect(r.recalculated).toBeGreaterThanOrEqual(1);
    const moved = await loadSubmission(db, s.id);
    expect(moved.a.deadline).toBe("2027-01-01");
    const [a] = (await db.execute<{ detail: string }>(sql`select detail from audit_log where reference = ${s.ackNo} and action = 'Pricing recalculated'`)).rows;
    expect(a.detail).toMatch(/reason: Effective Date gazetted/);
    await updateSettings(db, t.admin, { effectiveDate: "2026-10-22" });
  });
});

describe("own-use (SPEC §15)", () => {
  it("1 MW or more is refused; below threshold needs confirmation; OUN issued", async () => {
    const { registry } = await team();
    expect((await failure(createOwnUse(db, registry, { name: "Big", dateFiled: "2026-11-04", lga: "Ifo", units: [{ kw: 600 }, { kw: 400 }] }))).reasons[0]).toMatch(/1 MW or more/);
    expect((await failure(createOwnUse(db, registry, { name: "Small", dateFiled: "2026-11-04", lga: "Ifo", units: [{ kw: 50 }] }))).kind).toBe("confirm");
    const o = await createOwnUse(db, registry, { name: "Mid", dateFiled: "2026-11-04", lga: "Ifo", units: [{ kw: 250 }] });
    expect(o.ounNo).toMatch(/^OGSERC\/OUN\/2026\/\d{4}$/);
  });
});

describe("guards", () => {
  it("numbers and payment facts are locked in the database", async () => {
    const { registry } = await team();
    const s = await createSubmission(db, registry, input());
    await expect(db.execute(sql`update submissions set ack_no = 'X' where id = ${s.id}`)).rejects.toThrow();
    await recordPayment(db, registry, { dateReceived: "2026-11-04", reference: s.ackNo, amount: 500 });
    await expect(db.execute(sql`update payments set amount = 1 where reference = ${s.ackNo}`)).rejects.toThrow();
    const rows = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.id, s.id));
    expect(rows).toHaveLength(1);
  });
});

describe("list and record views agree", () => {
  it("assessMany gives the same assessment as loadSubmission", async () => {
    const t = await team();
    const a = await createSubmission(db, t.registry, input({ cacNo: "RC424242" }));
    await createSubmission(db, t.registry, input({ cacNo: "RC424242" }), { confirmWarnings: true });
    await recordPayment(db, t.registry, { dateReceived: "2026-11-04", reference: a.ackNo, amount: 10_000 });
    const rows = await db.select().from(submissions).where(eq(submissions.id, a.id));
    const [many] = await assessMany(db, rows);
    const one = await loadSubmission(db, a.id);
    expect(many.a).toEqual(one.a);
    expect(one.a.flags.map((f) => f.code)).toContain("DUPLICATE_CAC");
  });
});
