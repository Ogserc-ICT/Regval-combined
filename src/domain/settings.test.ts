import { describe, expect, it } from "vitest";
import { formatNumber } from "./numbering";
import { hasPermission, PERMISSIONS, ROLES } from "./roles";
import { DEFAULT_SETTINGS, registrationDeadline, resolveSettings, SETTING_META, settingsSchema } from "./settings";

describe("settings [G1]", () => {
  it("defaults validate and every setting has a label and source", () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    for (const k of Object.keys(DEFAULT_SETTINGS)) expect(SETTING_META[k as keyof typeof SETTING_META]).toBeDefined();
  });
  it("one Effective Date: 22 Oct 2026 + 60 = 21 Dec 2026", () => {
    expect(registrationDeadline(DEFAULT_SETTINGS)).toBe("2026-12-21");
  });
  it("changing the Effective Date moves the deadline (2 Nov 2026 → 1 Jan 2027)", () => {
    expect(registrationDeadline({ ...DEFAULT_SETTINGS, effectiveDate: "2026-11-02" })).toBe("2027-01-01");
  });
  it("the para 25 extension is applied", () => {
    expect(registrationDeadline({ ...DEFAULT_SETTINGS, extensionDays: 30 })).toBe("2027-01-20");
  });
  it("stored values override defaults; invalid stored values fall back", () => {
    const s = resolveSettings({ effectiveDate: "2026-11-02", extensionDays: -5, flagsBlockApproval: "Y" });
    expect(s.effectiveDate).toBe("2026-11-02");
    expect(s.extensionDays).toBe(0);
    expect(s.flagsBlockApproval).toBe("Y");
  });
  it("flags block approval defaults to N (approver may override with a reason, Q11)", () => {
    expect(DEFAULT_SETTINGS.flagsBlockApproval).toBe("N");
  });
});

describe("number formats (SPEC §3)", () => {
  it("formats each series", () => {
    expect(formatNumber({ series: "ACK", year: 2026, serial: 1 })).toBe("OGSERC/ACK/2026/00001");
    expect(formatNumber({ series: "PAY", year: 2027, serial: 3 })).toBe("OGSERC/PAY/2027/00003");
    expect(formatNumber({ series: "OUN", year: 2026, serial: 7 })).toBe("OGSERC/OUN/2026/0007");
    expect(formatNumber({ series: "DEF", year: 2027, serial: 1 })).toBe("OGSERC/DEF/2027/00001");
    expect(formatNumber({ series: "REG", year: 2026, serial: 1, scope: "D-GEN" })).toBe("OGSERC/REG/2026/D-GEN/0001");
  });
  it("the ACK prefix comes from the settings (Q25)", () => {
    expect(DEFAULT_SETTINGS.ackPrefix).toBe("OGSERC/ACK");
    expect(formatNumber({ series: "ACK", year: 2026, serial: 2, ackPrefix: "OGSERC/REG-ACK" })).toBe("OGSERC/REG-ACK/2026/00002");
    expect(settingsSchema.shape.ackPrefix.safeParse("OGSERC/RE-ACK").success).toBe(true);
    for (const bad of ["", "ogserc/ack", "OGSERC//ACK", "/ACK", "ACK/", "OGSERC ACK"]) expect(settingsSchema.shape.ackPrefix.safeParse(bad).success).toBe(false);
  });
  it("refuses incomplete parts", () => {
    expect(() => formatNumber({ series: "ACK", year: 0, serial: 1 })).toThrow();
    expect(() => formatNumber({ series: "REG", year: 2026, serial: 1 })).toThrow();
    expect(() => formatNumber({ series: "ACK", year: 2026, serial: 0 })).toThrow();
  });
});

describe("roles [G6], [G8]", () => {
  it("seven roles; the Registration officer enters filings and records payments, Finance decides them", () => {
    expect([...ROLES]).toEqual(["registration", "evaluator", "supervisor", "approver", "finance", "admin", "viewer"]);
    expect(hasPermission(["registration"], "submission:save")).toBe(true);
    expect(hasPermission(["registration"], "payment:record")).toBe(true);
    expect(hasPermission(["registration"], "documents:update")).toBe(true);
    expect(hasPermission(["registration"], "payment:decide")).toBe(false);
    expect(hasPermission(["viewer"], "submission:save")).toBe(false);
  });
  it("every permission names known roles", () => {
    for (const roles of Object.values(PERMISSIONS)) for (const r of roles) expect(ROLES).toContain(r);
  });
});
