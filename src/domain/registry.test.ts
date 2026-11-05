import { describe, expect, it } from "vitest";
import { lagosInstant } from "./dates";
import {
  assessFile,
  assessInward,
  assessOutward,
  inwardResponseDue,
  registerEntryState,
  unitRecipients,
  type InwardFacts,
  type OutwardFacts,
} from "./registry";
import { DEFAULT_SETTINGS } from "./settings";
import { holidaySet } from "./workdays";

const s = DEFAULT_SETTINGS;
const hols = holidaySet(["2026-12-25", "2026-12-28"]);

const inward = (o: Partial<InwardFacts> = {}): InwardFacts => ({
  deemedReceiptDate: "2026-12-01",
  type: { name: "Other correspondence", responseTargetDays: 10, filingType: null },
  sender: "A",
  senderCategory: "Other",
  subject: "S",
  mode: "Hand delivery",
  relatedOgsercNo: null,
  cacNo: null,
  schedule2Count: null,
  feeEvidence: null,
  ackIssuedVia: "Printed slip",
  actionRequired: null,
  priority: null,
  responseDueOverride: null,
  routedAt: null,
  forwardedOn: null,
  closedManualOn: null,
  replyDispatchedOn: null,
  ...o,
});
const ctx = (today: string) => ({ settings: s, holidays: hols, today, registrationDeadline: "2026-12-21" });

describe("inward response due (Inward Register AN)", () => {
  it("override wins; For information has none; Urgent uses 1 working day; type target otherwise", () => {
    expect(inwardResponseDue(inward({ responseDueOverride: "2027-01-05" }), s, hols)).toBe("2027-01-05");
    expect(inwardResponseDue(inward({ actionRequired: "For information" }), s, hols)).toBeNull();
    expect(inwardResponseDue(inward({ priority: "Urgent" }), s, hols)).toBe("2026-12-02");
    // 1 Dec (Tue) + 10 working days = 15 Dec
    expect(inwardResponseDue(inward(), s, hols)).toBe("2026-12-15");
    // A type with target 0 has no response due; a missing type uses the default (10)
    expect(inwardResponseDue(inward({ type: { name: "Circular", responseTargetDays: 0, filingType: null } }), s, hols)).toBeNull();
    expect(inwardResponseDue(inward({ type: null }), s, hols)).toBe("2026-12-15");
  });
  it("working days skip holidays: 24 Dec + 1 → 29 Dec", () => {
    expect(inwardResponseDue(inward({ deemedReceiptDate: "2026-12-24", priority: "Urgent" }), s, hols)).toBe("2026-12-29");
  });
});

describe("inward status (Inward Register AS), first match", () => {
  it("walks through the states", () => {
    expect(assessInward(inward(), ctx("2026-12-01")).status).toBe("Awaiting routing");
    expect(assessInward(inward({ routedAt: new Date() }), ctx("2026-12-01")).status).toBe("Awaiting forwarding");
    expect(assessInward(inward({ routedAt: new Date(), forwardedOn: "2026-12-02" }), ctx("2026-12-03")).status).toBe("Open");
    expect(assessInward(inward({ forwardedOn: "2026-12-02", actionRequired: "File only" }), ctx("2026-12-03")).status).toBe("Noted / filed");
    expect(assessInward(inward({ forwardedOn: "2026-12-02" }), ctx("2026-12-16")).status).toBe("Overdue");
    expect(assessInward(inward({ replyDispatchedOn: "2026-12-10" }), ctx("2026-12-16")).status).toBe("Closed");
  });
  it("counts working days at the Registry and open", () => {
    const a = assessInward(inward({ forwardedOn: "2026-12-03" }), ctx("2026-12-08"));
    expect(a.workingDaysAtRegistry).toBe(2);
    expect(a.workingDaysOpen).toBe(5);
  });
});

describe("inward flags", () => {
  const reg = { name: "REG-01 Registration (new)", responseTargetDays: 20, filingType: "NEW" };
  it("REG-01: after deadline, no fee evidence, Schedule 2 short, duplicate CAC", () => {
    const a = assessInward(inward({ type: reg, deemedReceiptDate: "2026-12-22", schedule2Count: 9, schedule2Expected: 12, cacNo: "RC1" }), { ...ctx("2026-12-22"), duplicateRegCac: true });
    expect(a.filedAfterDeadline).toBe(true);
    expect(a.flags).toEqual(expect.arrayContaining(["No fee evidence with REG-01", "Schedule 2 documents incomplete at receipt (9 of 12)", "Possible duplicate REG-01: CAC RC1 already filed"]));
  });
  it("Schedule 2: no flag while the form is unknown (Q16)", () => {
    expect(assessInward(inward({ type: reg, schedule2Count: 3 }), ctx("2026-12-01")).flags.join()).not.toContain("Schedule 2");
  });
  it("only REG-01 items have the deadline flag", () => {
    expect(assessInward(inward(), ctx("2026-12-01")).filedAfterDeadline).toBeNull();
  });
  it("forwarding target, acknowledgement, related number", () => {
    const a = assessInward(
      inward({ ackIssuedVia: "Not yet issued", type: { name: "Update - material change", responseTargetDays: 10, filingType: "UPDATE" } }),
      ctx("2026-12-04"),
    );
    expect(a.flags).toEqual(expect.arrayContaining(["Not forwarded within 2 working days", "Acknowledgement not yet issued", "Related OGSERC number missing"]));
  });
});

describe("Register entry state (Inward Register BN)", () => {
  const t = { name: "REG-01 Registration (new)", responseTargetDays: 20, filingType: "NEW" };
  it("follows the entry", () => {
    expect(registerEntryState({ name: "Other", responseTargetDays: 10, filingType: null }, null)).toBe("Not a filing");
    expect(registerEntryState(t, null)).toBe("Awaiting Register entry");
    expect(registerEntryState(t, { kind: "submission", saved: false })).toBe("Register row started – complete and save it");
    expect(registerEntryState(t, { kind: "submission", saved: true })).toBe("Saved on Register");
    expect(registerEntryState(t, { kind: "own_use", saved: true })).toBe("Saved on Own-Use");
  });
});

const outward = (o: Partial<OutwardFacts> = {}): OutwardFacts => ({
  documentDate: "2026-12-01",
  docType: { responseExpected: true, responseDays: 10 },
  subject: "S",
  addressee: "A",
  recipientCategory: "Other",
  dispatchMode: "Hand delivery",
  dispatchedOn: null,
  deliveryConfirmed: false,
  responseExpected: null,
  responseDueOverride: null,
  responseReceivedOn: null,
  ...o,
});
const octx = (today: string) => ({ settings: s, holidays: hols, today });

describe("outward", () => {
  it("statuses and response due", () => {
    expect(assessOutward(outward(), octx("2026-12-01")).status).toBe("Not yet dispatched");
    const a = assessOutward(outward({ dispatchedOn: "2026-12-02" }), octx("2026-12-03"));
    expect(a.responseDue).toBe("2026-12-16");
    expect(a.status).toBe("Awaiting response");
    expect(assessOutward(outward({ dispatchedOn: "2026-12-02" }), octx("2026-12-17")).status).toBe("Response overdue");
    expect(assessOutward(outward({ dispatchedOn: "2026-12-02", responseReceivedOn: "2026-12-10" }), octx("2026-12-17")).status).toBe("Response received");
    expect(assessOutward(outward({ docType: null, dispatchedOn: "2026-12-02", deliveryConfirmed: true }), octx("2026-12-17")).status).toBe("Delivered");
    expect(assessOutward(outward({ responseExpected: false, dispatchedOn: "2026-12-02" }), octx("2026-12-03")).status).toBe("Dispatched");
  });
  it("flags: late dispatch, proof of delivery, dispatched before document date", () => {
    expect(assessOutward(outward(), octx("2026-12-04")).flags).toContain("Not dispatched within 2 working days");
    expect(assessOutward(outward({ responseExpected: false, dispatchedOn: "2026-12-01" }), octx("2026-12-09")).flags).toContain("Delivery not confirmed after 5 working days");
    expect(assessOutward(outward({ responseExpected: false, dispatchedOn: "2026-12-01", dispatchMode: "Internal mail" }), octx("2026-12-09")).flags).toEqual([]);
    expect(assessOutward(outward({ dispatchedOn: "2026-11-30" }), octx("2026-12-01")).flags).toContain("Dispatched before the document date");
  });
});

describe("files", () => {
  it("currently with, return due, overdue", () => {
    const m = { outAt: lagosInstant("2026-12-01", "09:00"), returnByOverride: null, returnedAt: null, issuedTo: "Ade", unitName: "Legal" };
    const a = assessFile({ title: "T", status: "Open", closedOn: null, movements: [m], correspondenceDates: [] }, { settings: s, holidays: hols, today: "2026-12-07" });
    expect(a.currentlyWith).toBe("Ade");
    expect(a.returnDue).toBe("2026-12-04");
    expect(a.overdue).toBe(true);
    expect(a.flags).toContain("Out beyond its return date");
    const back = assessFile({ title: "T", status: "Closed", closedOn: "2026-12-01", movements: [{ ...m, returnedAt: new Date() }], correspondenceDates: ["2026-12-05"] }, { settings: s, holidays: hols, today: "2026-12-07" });
    expect(back.currentlyWith).toBe("Registry");
    expect(back.flags).toEqual(["Correspondence after the file was closed"]);
  });
});

describe("email recipients (SPEC §25)", () => {
  it("merges unit and division without duplicates", () => {
    expect(unitRecipients("a@x.ng; b@x.ng", "A@x.ng")).toEqual(["a@x.ng", "b@x.ng"]);
    expect(unitRecipients(null, null)).toEqual([]);
  });
});
