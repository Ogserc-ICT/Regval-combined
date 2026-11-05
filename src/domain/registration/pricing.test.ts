import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { categoryAuto, currentPricing, daysLate, deadlineFor, lateCharge, money } from "./pricing";
import { REF, submission } from "./testing";

const S = DEFAULT_SETTINGS;
const cat = (primary: string, cap: number | null, others: string[] = []) => categoryAuto(primary, others, cap, REF, S);
const kobo = (n: number) => n * 100;

describe("category (SPEC §7, §30.1)", () => {
  it.each([
    ["SDC", null, ["GEN"], "A"],
    ["INT", null, [], "B"],
    ["GEN", 12, [], "C"],
    ["GEN", 5, [], "D"],
    ["GEN", 0.5, [], "K"],
    ["CPT", 0.5, [], "D"],
    ["MGD", 0.3, [], "E"],
    ["DIS", null, [], "F"],
    ["MSL", null, [], "F"],
    ["IDN", null, [], "F"],
    ["TRD", null, [], "F"],
    ["EST", null, [], "G"],
    ["MET", null, [], "H"],
    ["FRN", null, [], "J"],
    ["SUP", 0.5, [], "K"],
    ["SUP", 2, [], "K"],
    ["GEN", 5, ["DIS"], "F"],
    ["GEN", 12, ["DIS"], "C"],
    ["MGD", 12, ["GEN"], "C"],
    ["OTH", 0.2, [], "K"],
    ["OTH", 3, [], "D"],
  ] as const)("%s at %s MW with %j → %s", (p, c, o, expected) => {
    expect(cat(p, c, [...o])).toBe(expected);
  });
  it("supply / retail at 1 MW+ follows the setting", () => {
    expect(categoryAuto("SUP", [], 2, REF, { supplyRetailCategoryAt1MW: "F" })).toBe("F");
  });
  it("no primary activity → no category; an override wins", () => {
    expect(cat("", null)).toBeNull();
    expect(currentPricing(submission({ categoryOverride: "G" }), REF, S)?.category).toBe("G");
  });
});

describe("late charge [G14]", () => {
  it("required: category D, 100 days late → ₦10,000,000 (workbook gave ₦10,500,000)", () => {
    expect(lateCharge(100, kobo(500_000), kobo(100_000), kobo(10_000_000))).toBe(kobo(10_000_000));
  });
  it("caps the whole charge, not just the daily part", () => {
    expect(lateCharge(94, kobo(500_000), kobo(100_000), kobo(10_000_000))).toBe(kobo(9_900_000));
    expect(lateCharge(95, kobo(500_000), kobo(100_000), kobo(10_000_000))).toBe(kobo(10_000_000));
    expect(lateCharge(0, kobo(500_000), kobo(100_000), kobo(10_000_000))).toBe(0);
  });
});

// SPEC §30.2: deadline 21 Dec 2026; deemed 31 Dec 2026 = 10 days, 31 Mar 2027 = 100, 28 Aug 2027 = 250.
const ROWS: [string, string, number, number, number, number, number][] = [
  // cat, primary activity (+capacity), fee, late10, total10, late100, late250
  ["A", "SDC", 1_000_000, 3_000_000, 4_000_000, 20_000_000, 20_000_000],
  ["B", "INT", 1_000_000, 3_000_000, 4_000_000, 20_000_000, 20_000_000],
  ["C", "GEN:12", 500_000, 3_000_000, 3_500_000, 20_000_000, 20_000_000],
  ["D", "GEN:5", 300_000, 1_500_000, 1_800_000, 10_000_000, 10_000_000],
  ["E", "MGD:0.5", 250_000, 1_500_000, 1_750_000, 10_000_000, 10_000_000],
  ["F", "DIS", 500_000, 3_000_000, 3_500_000, 20_000_000, 20_000_000],
  ["G", "EST", 500_000, 3_000_000, 3_500_000, 20_000_000, 20_000_000],
  ["H", "MET", 250_000, 1_500_000, 1_750_000, 10_000_000, 10_000_000],
  ["J", "FRN", 250_000, 1_500_000, 1_750_000, 10_000_000, 10_000_000],
  ["K", "GEN:0.5", 100_000, 200_000, 300_000, 1_100_000, 2_000_000],
];

describe("fees and late charges, categories A–K (SPEC §30.2)", () => {
  it.each(ROWS)("category %s", (c, act, fee, late10, total10, late100, late250) => {
    const [code, mw] = act.split(":");
    const base = { primaryActivity: code, installedCapacityMw: mw ? Number(mw) : null };
    const on = (deemed: string) => money(submission({ ...base, deemedReceiptDate: deemed }), REF, S);
    const m10 = on("2026-12-31");
    expect(m10.categoryApplied).toBe(c);
    expect(m10.deadline).toBe("2026-12-21");
    expect(m10.daysLate).toBe(10);
    expect(m10.registrationFee).toBe(kobo(fee));
    expect(m10.lateCharge).toBe(kobo(late10));
    expect(m10.totalDue).toBe(kobo(total10));
    expect(on("2027-03-31").daysLate).toBe(100);
    expect(on("2027-03-31").lateCharge).toBe(kobo(late100));
    expect(on("2027-08-28").daysLate).toBe(250);
    expect(on("2027-08-28").lateCharge).toBe(kobo(late250));
    expect(on("2026-12-21").lateCharge).toBe(0);
  });

  it("category I (own-use) has a fee and no late charge", () => {
    const i = REF.fees.find((f) => f.category === "I")!;
    expect(i.registrationFee).toBe(kobo(100_000));
    expect([i.lateInitial, i.lateDaily, i.lateCap]).toEqual([0, 0, 0]);
  });

  it("an email at 18:00 on the deadline is deemed received the next day: 1 day late (D: ₦600,000)", () => {
    const m = money(submission({ deemedReceiptDate: "2026-12-22" }), REF, S);
    expect(m.daysLate).toBe(1);
    expect(m.lateCharge).toBe(kobo(600_000));
  });

  it("waiver reduces the fee only (waiverReducesLate = N)", () => {
    const m = money(submission({ deemedReceiptDate: "2026-12-31", approvedWaiver: kobo(100_000) }), REF, S);
    expect(m.netFee).toBe(kobo(200_000));
    expect(m.totalDue).toBe(kobo(1_700_000));
    const y = money(submission({ deemedReceiptDate: "2026-12-31", approvedWaiver: kobo(100_000) }), REF, { ...S, waiverReducesLate: "Y" });
    expect(y.totalDue).toBe(kobo(1_700_000));
  });

  it("updates and annual confirmations: no fee (unless set), no late charge", () => {
    const u = money(submission({ filingType: "UPDATE", deemedReceiptDate: "2027-03-31" }), REF, S);
    expect([u.registrationFee, u.lateCharge, u.totalDue, u.deadline]).toEqual([0, 0, 0, null]);
    expect(money(submission({ filingType: "ANNUAL" }), REF, { ...S, feeOnUpdates: "Y" }).registrationFee).toBe(kobo(300_000));
  });
});

describe("deadlines and the snapshot (SPEC §9, §30.3)", () => {
  it("existing operator: Effective Date + 60 (+ extension)", () => {
    expect(deadlineFor(submission(), S)).toBe("2026-12-21");
    expect(deadlineFor(submission(), { ...S, extensionDays: 30 })).toBe("2027-01-20");
  });
  it("new operator: 30 days before the planned start", () => {
    expect(deadlineFor(submission({ operatingOnEffectiveDate: "N", plannedStartDate: "2027-03-01" }), S)).toBe("2027-01-30");
    expect(deadlineFor(submission({ operatingOnEffectiveDate: "N", plannedStartDate: null }), S)).toBeNull();
  });
  it("a saved snapshot keeps its deadline when the Effective Date changes (Q6)", () => {
    const priced = currentPricing(submission(), REF, S)!;
    const moved = { ...S, effectiveDate: "2026-11-02" };
    const m = money(submission({ priced, deemedReceiptDate: "2026-12-31" }), REF, moved);
    expect(m.deadline).toBe("2026-12-21");
    expect(m.daysLate).toBe(10);
    // Unpriced records move with the setting.
    expect(money(submission({ deemedReceiptDate: "2026-12-31" }), REF, moved).deadline).toBe("2027-01-01");
  });
  it("days late never goes negative", () => {
    expect(daysLate("2026-12-01", "2026-12-21")).toBe(0);
  });
});
