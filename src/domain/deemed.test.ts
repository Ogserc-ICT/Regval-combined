import { describe, expect, it } from "vitest";
import { lagosInstant } from "./dates";
import { deemedReceiptDate } from "./deemed";
import { holidaySet } from "./workdays";
import holidaysJson from "../../seed/data/holidays.json";

const holidays = holidaySet(holidaysJson.map((h) => h.date));
const deemed = (date: string, time: string, mode: string) =>
  deemedReceiptDate({ receivedAt: lagosInstant(date, time), mode, closingTime: "17:00", holidays });

describe("deemed receipt, para 10(3) (SPEC §4.1, §30.4)", () => {
  // Acceptance checks (docs/COMBINED_BUILD.md)
  it("email at 17:30 on Friday 18 Dec 2026 → Monday 21 Dec", () => {
    expect(deemed("2026-12-18", "17:30", "Email")).toBe("2026-12-21");
  });
  it("email at 18:00 on Thursday 24 Dec 2026 → Tuesday 29 Dec (25, 26, 28 Dec holidays)", () => {
    expect(deemed("2026-12-24", "18:00", "Email")).toBe("2026-12-29");
  });
  it("hand delivery at 16:00 on Friday 18 Dec 2026 → that day", () => {
    expect(deemed("2026-12-18", "16:00", "By hand")).toBe("2026-12-18");
  });

  // Worked examples
  it("hand delivery after 17:00 keeps its date (cut-off is electronic only, Q1)", () => {
    expect(deemed("2026-12-18", "17:30", "By hand")).toBe("2026-12-18");
    expect(deemed("2026-12-18", "17:30", "Courier")).toBe("2026-12-18");
  });
  it("portal at 16:59 stays; at 17:00 exactly moves", () => {
    expect(deemed("2026-12-18", "16:59", "Online portal")).toBe("2026-12-18");
    expect(deemed("2026-12-18", "17:00", "Online portal")).toBe("2026-12-21");
  });
  it("any channel on a holiday or weekend moves to the next working day", () => {
    expect(deemed("2026-12-26", "10:00", "By hand")).toBe("2026-12-29");
    expect(deemed("2026-12-27", "09:00", "Email")).toBe("2026-12-29");
  });
  it("hand delivery late on Tue 3 Nov 2026 (20:50) → 3 Nov", () => {
    expect(deemed("2026-11-03", "20:50", "By hand")).toBe("2026-11-03");
  });
  it("email at 18:00 on 31 Dec 2026 → Mon 4 Jan 2027 (year changes, Q3)", () => {
    expect(deemed("2026-12-31", "18:00", "Email")).toBe("2027-01-04");
  });
  it("uses Lagos time, not UTC: 16:30 UTC is 17:30 in Lagos", () => {
    const at = new Date("2026-12-18T16:30:00Z");
    expect(deemedReceiptDate({ receivedAt: at, mode: "Email", closingTime: "17:00", holidays })).toBe("2026-12-21");
  });
  it("respects a changed closing time", () => {
    const at = lagosInstant("2026-12-18", "16:30");
    expect(deemedReceiptDate({ receivedAt: at, mode: "Email", closingTime: "16:00", holidays })).toBe("2026-12-21");
  });
});
