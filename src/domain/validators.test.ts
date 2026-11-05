import { describe, expect, it } from "vitest";
import { formatNaira, naira } from "./money";
import { PHONE_MESSAGE, validateCac, validateEmail, validatePhone } from "./validators";

describe("phone [G5]", () => {
  it("acceptance: 08021846578 is kept with its leading zero", () => {
    expect(validatePhone("08021846578")).toEqual({ ok: true, value: "08021846578" });
  });
  it("acceptance: 8021846578 is rejected with a clear message", () => {
    const r = validatePhone("8021846578");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toBe(PHONE_MESSAGE);
    expect(PHONE_MESSAGE).toContain("08021846578");
  });
  it("accepts +234 and 10 digits, ignoring spaces and dashes", () => {
    expect(validatePhone("+234 802 184 6578")).toEqual({ ok: true, value: "+2348021846578" });
    expect(validatePhone("0802-184-6578")).toEqual({ ok: true, value: "08021846578" });
  });
  it("rejects wrong lengths, letters and other prefixes", () => {
    for (const bad of ["0802184657", "080218465789", "0802184657a", "2348021846578", "+23480218465", ""]) {
      expect(validatePhone(bad).ok).toBe(false);
    }
  });
});

describe("CAC number", () => {
  it("accepts RC, BN or IT, an optional space, then digits", () => {
    expect(validateCac("rc1234567")).toEqual({ ok: true, value: "RC1234567" });
    expect(validateCac("BN 98765").ok).toBe(true);
    expect(validateCac("IT12").ok).toBe(true);
  });
  it("rejects anything else", () => {
    for (const bad of ["RC", "RC  123", "AB123", "RC12A", "1234567"]) expect(validateCac(bad).ok).toBe(false);
  });
});

describe("email", () => {
  it("follows the workbook rule", () => {
    expect(validateEmail("it@ogserc.org.ng").ok).toBe(true);
    for (const bad of ["@x.ng", "a@b", "a@@b.ng", "a b@c.ng", "a@b.", "a@.ng"]) expect(validateEmail(bad).ok).toBe(false);
  });
});

describe("money", () => {
  it("formats naira from kobo like modCommon.Naira", () => {
    expect(formatNaira(naira(10_000_000))).toBe("₦10,000,000");
    expect(formatNaira(naira(1500.5))).toBe("₦1,500.50");
    expect(formatNaira(0)).toBe("₦0");
    expect(formatNaira(-25000)).toBe("-₦250");
  });
});
