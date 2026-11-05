import { describe, expect, it } from "vitest";
import { assess, separationOfDuties } from "./assess";
import { DECISION_CHECKS } from "./checks";
import { currentPricing } from "./pricing";
import { context, REF, submission } from "./testing";
import { DEFAULT_SETTINGS } from "../settings";
import { installedKw, eligibility, assessOwnUse } from "./ownuse";

const priced = currentPricing(submission(), REF, DEFAULT_SETTINGS)!;
const confirmed = (amount: number) => ({ amount, dateReceived: "2026-11-21", financeStatus: "Confirmed" as const, reversed: false });
const allManualYes = Object.fromEntries(DECISION_CHECKS.map((id) => [id, "Y"]));
const allDocsY = (form: string) => Object.fromEntries(REF.formDocs.filter((d) => d.form === form).map((d) => [d.key, "Y"]));

describe("Finance gate (SPEC §11.3)", () => {
  it("is closed until confirmed payments cover the net fee", () => {
    const a = assess(submission({ priced }), context());
    expect(a.gateCleared).toBe(false);
    expect(a.gateReason).toBe("Payment not yet confirmed by Finance: ₦0 of ₦300,000 confirmed");
    expect(a.nextAction).toBe("Await payment of ₦300,000, then Finance confirmation");
  });
  it("pending payments do not count; they show as with Finance", () => {
    const a = assess(submission({ priced }), context({ payments: [{ ...confirmed(30_000_000), financeStatus: "Pending" }] }));
    expect(a.gateCleared).toBe(false);
    expect(a.gateReason).toContain("₦300,000 recorded and waiting for Finance");
    expect(a.stage).toBe(2);
  });
  it("opens once confirmed; a reversed payment no longer counts", () => {
    expect(assess(submission({ priced }), context({ payments: [confirmed(30_000_000)] })).gateCleared).toBe(true);
    expect(assess(submission({ priced }), context({ payments: [{ ...confirmed(30_000_000), reversed: true }] })).gateCleared).toBe(false);
  });
  it("a filing with nothing to pay clears at once", () => {
    const u = submission({ filingType: "UPDATE", formFiled: "REG-01D", priced: { ...priced, fee: 0, lateInitial: 0, lateDaily: 0, lateCap: 0, deadline: null } });
    expect(assess(u, context()).gateCleared).toBe(true);
  });
});

describe("documents (SPEC §10)", () => {
  it("REG-01D has 12 documents; conditions make some N/A; payment evidence is automatic", () => {
    const s = submission({ priced, conditions: { grid_connected: false, generation_for_sale: false } });
    const a = assess(s, context({ payments: [confirmed(30_000_000)] }));
    expect(a.documents.form).toBe("REG-01D");
    expect(a.documents.listed).toBe(12);
    const byKey = Object.fromEntries(a.documents.items.map((i) => [i.key, i.value]));
    expect(byKey.connection_agreement).toBe("N/A");
    expect(byKey.ppa_offtake).toBe("N/A");
    expect(byKey.payment_evidence).toBe("Y");
    expect(a.documents.items.at(-1)?.key).toBe("payment_evidence");
    expect(a.documents.pending).toBe(9);
  });
  it("unlicensed makes the licences document N/A", () => {
    const a = assess(submission({ priced, licenceStatus: "Unlicensed", licences: [] }), context());
    expect(a.documents.items.find((i) => i.key === "licences")?.value).toBe("N/A");
  });
  it("a confirmed category re-categorises the documents (accept and re-categorise)", () => {
    const a = assess(submission({ priced, confirmedCategory: "C", categoryConfirmedReason: "12 MW plant" }), context());
    expect(a.documents.form).toBe("REG-01C");
  });
  it("complete when every document is Y or N/A and the fee is confirmed", () => {
    const a = assess(submission({ priced }), context({ payments: [confirmed(30_000_000)], checklist: allDocsY("REG-01D") }));
    expect(a.documents.complete).toBe(true);
    expect(a.submissionComplete).toBe(true);
  });
});

describe("clocks and SLA (SPEC §9, §30.3)", () => {
  it("determination due 30 days after complete; deficiency response 14 days after notice", () => {
    const a = assess(
      submission({ priced, status: "Deficiency Notice Issued", dateSubmissionComplete: "2027-01-04", deficiencyNoticeDate: "2027-01-04" }),
      context({ today: "2027-01-19" }),
    );
    expect(a.determinationDue).toBe("2027-02-03");
    expect(a.deficiencyResponseDue).toBe("2027-01-18");
    expect(a.sla).toBe("Red");
    expect(a.nextAction).toBe("Response overdue – lapse the submission (para 13(2))");
  });
  it("unlicensed: licence application due 90 days after the Effective Date", () => {
    expect(assess(submission({ priced, licenceStatus: "Unlicensed", licences: [] }), context()).licenceApplicationDue).toBe("2027-01-20");
  });
});

describe("EVAL-01 and approval (SPEC §12)", () => {
  const ready = () =>
    submission({ priced, status: "Received - Under Review", releasedOn: "2026-11-21", dateSubmissionComplete: "2026-11-22", confirmedCategory: "D" });
  const ev = (over = {}) => ({
    evaluatingOfficerId: "u-eval",
    reviewingSupervisorId: "u-sup",
    approvingOfficerId: "u-appr",
    startedOn: "2026-11-21",
    flagOverrideReason: null,
    finalDecision: null,
    answers: allManualYes,
    ...over,
  });
  const ctx = (over = {}) => context({ payments: [confirmed(30_000_000)], checklist: allDocsY("REG-01D"), evaluation: ev(), ...over });

  it("all clear → Register, no blockers", () => {
    const a = assess(ready(), ctx());
    expect(a.checks.failed).toBe(0);
    expect(a.checks.pending).toBe(0);
    expect(a.recommendedOutcome).toBe("Register (13(1)(a))");
    expect(a.approvalBlockers).toEqual([]);
    expect(a.evaluationStatus).toBe("Ready for decision");
  });
  it("acceptance: approval is refused while the Commissioner signatory is empty, with the reason", () => {
    const a = assess(ready(), ctx({ signatories: { chairman: true, commissioner: false } }));
    expect(a.approvalBlockers).toEqual(["Certificate signatory not set: Commissioner. An admin must add it under Admin › Signatories."]);
  });
  it("lists every blocker at once", () => {
    const a = assess(ready(), context({ evaluation: null, signatories: { chairman: false, commissioner: false } }));
    expect(a.approvalBlockers.length).toBeGreaterThanOrEqual(6);
    expect(a.approvalBlockers).toContain("No evaluating officer assigned");
    expect(a.approvalBlockers.some((b) => b.startsWith("Payment not yet confirmed"))).toBe(true);
  });
  it("[G8] four different people", () => {
    expect(separationOfDuties({ evaluatingOfficerId: "a", reviewingSupervisorId: "a", approvingOfficerId: "a" }, "a")).toHaveLength(6);
    expect(separationOfDuties({ evaluatingOfficerId: "a", reviewingSupervisorId: "b", approvingOfficerId: "c" }, "d")).toEqual([]);
  });
  it("unresolved flags block unless a reason is written (flagsBlockApproval = N, Q11)", () => {
    const s = { ...ready(), cacNo: "123" }; // CAC_FORMAT flag
    const unexplained = assess(s, ctx()).approvalBlockers;
    expect(unexplained).toContain("1 evaluation check(s) failed"); // 7.6 is N while a flag is unexplained
    expect(unexplained).toContainEqual(expect.stringMatching(/no written override reason/));
    expect(assess(s, ctx({ evaluation: ev({ flagOverrideReason: "CAC checked on the CAC portal" }) })).approvalBlockers).toEqual([]);
    const blocking = assess(s, { ...ctx({ evaluation: ev({ flagOverrideReason: "x" }) }), settings: { ...DEFAULT_SETTINGS, flagsBlockApproval: "Y" } });
    expect(blocking.approvalBlockers).toContainEqual(expect.stringMatching(/^1 unresolved data flag/));
  });
  it("auto checks: late filing, captive below 1 MW, duplicate CAC", () => {
    const late = assess({ ...ready(), deemedReceiptDate: "2026-12-31" }, ctx());
    const v = (a: ReturnType<typeof assess>, id: string) => a.checks.results.find((r) => r.id === id)?.value;
    expect(v(late, "1.8")).toBe("N");
    expect(v(late, "1.9")).toBe("Y");
    const cpt = assess({ ...ready(), primaryActivity: "CPT", installedCapacityMw: 0.5 }, ctx());
    expect(v(cpt, "1.4")).toBe("N");
    expect(cpt.recommendedOutcome).toBe("Redirect to REG-01I / outside scope");
    expect(v(assess(ready(), ctx({ duplicates: { cac: true, name: false, registrationNo: false } })), "1.5")).toBe("N");
  });
  it("checks that do not apply are N/A automatically", () => {
    const a = assess(ready(), ctx());
    const r = (id: string) => a.checks.results.find((x) => x.id === id)!;
    expect(r("1.7")).toMatchObject({ value: "N/A", applicable: false }); // not multi-State
    expect(r("4.9")).toMatchObject({ value: "N/A", applicable: false }); // licensed
    expect(r("5.3")).toMatchObject({ value: "N/A", applicable: false }); // no waiver
  });
  it("determination overdue on a new registration → provisional registration recommended", () => {
    const a = assess(ready(), ctx({ today: "2026-12-23" }));
    expect(a.recommendedOutcome).toBe("Provisional registration (13(4))");
    expect(a.nextAction).toBe("Overdue – provisional registration applies (para 13(4))");
  });
});

describe("data flags (SPEC §14)", () => {
  it("raises the workbook's flags", () => {
    const codes = (s: Parameters<typeof assess>[0]) => assess(s, context()).flags.map((f) => f.code);
    expect(codes(submission({ primaryActivity: "GEN", installedCapacityMw: null }))).toContain("NO_CAPACITY");
    expect(codes(submission({ licenceStatus: "Unlicensed" }))).toContain("LICENCE_NO_WITHOUT_LICENCE");
    expect(codes(submission({ licences: [] }))).toContain("LICENCE_NO_MISSING");
    expect(codes(submission({ formFiled: "REG-01C" }))).toContain("FORM_CATEGORY_MISMATCH");
    expect(codes(submission({ operatingOnEffectiveDate: "N" }))).toContain("NO_START_DATE");
    expect(codes(submission({ licences: [{ licenceNo: "X", expiryDate: "2027-01-31" }] }))).toContain("LICENCE_RENEWAL");
    expect(codes(submission())).toEqual([]);
  });
  it("flags saved pricing that differs from the current rules", () => {
    const s = submission({ priced });
    const a = assess(s, context({}, { effectiveDate: "2026-11-02" }));
    expect(a.flags.find((f) => f.code === "PRICING_OUT_OF_DATE")?.text).toBe(
      "Saved pricing differs from current rules (deadline 21 December 2026 → 1 January 2027; Effective Date 22 October 2026 → 2 November 2026) – an admin may recalculate",
    );
  });
});

describe("own-use (SPEC §15)", () => {
  it("capacity, eligibility and fee", () => {
    expect(installedKw([150.0004, 100])).toBe(250);
    expect(eligibility(250, 200)).toBe("Notification required");
    expect(eligibility(150, 200)).toBe("Not required");
    expect(eligibility(1000, 200)).toBe("Register as operator");
    const a = assessOwnUse(
      { ounNo: "OGSERC/OUN/2026/0001", name: "Factory", dateFiled: "2026-11-20", cacNo: null, siteAddress: null, lga: "Ifo", unitsKw: [300], flagOverrideReason: null, pricedFee: null, pricedThresholdKw: null, registrationNo: null, createdBy: "u" },
      { settings: DEFAULT_SETTINGS, ref: REF, payments: [], checklist: {}, duplicates: { site: false, cacOnRegister: false }, registrationDeadline: "2026-12-21", signatories: { chairman: true, commissioner: false } },
    );
    expect(a.feeDue).toBe(10_000_000);
    expect(a.documents.listed).toBe(3);
    expect(a.registrationBlockers).toContain("Own-use certificates are switched off in Settings");
    expect(a.registrationBlockers.some((b) => b.includes("Commissioner"))).toBe(true);
  });
});
