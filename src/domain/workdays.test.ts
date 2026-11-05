import { describe, expect, it } from "vitest";
import { addDays, diffDays, isoWeekday, lagosDate, lagosInstant, lagosMinuteOfDay, longDate } from "./dates";
import { addWorkingDays, holidaySet, isWorkingDay, networkDays, workingDaysElapsed } from "./workdays";
import holidaysJson from "../../seed/data/holidays.json";

const hols = holidaySet(holidaysJson.map((h) => h.date));

describe("calendar dates", () => {
  it("adds and diffs days across months and years", () => {
    expect(addDays("2026-10-22", 60)).toBe("2026-12-21");
    expect(addDays("2027-03-01", -30)).toBe("2027-01-30");
    expect(diffDays("2026-12-21", "2027-03-31")).toBe(100);
  });
  it("knows the weekday (Mon = 1)", () => {
    expect(isoWeekday("2026-12-18")).toBe(5);
    expect(isoWeekday("2026-12-20")).toBe(7);
    expect(isoWeekday("2026-11-03")).toBe(2);
  });
  it("converts to and from Africa/Lagos (UTC+1)", () => {
    const i = lagosInstant("2026-12-31", "23:30");
    expect(i.toISOString()).toBe("2026-12-31T22:30:00.000Z");
    expect(lagosDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(lagosMinuteOfDay(new Date("2026-12-18T16:30:00Z"))).toBe(17 * 60 + 30);
  });
  it("formats long dates as the workbook does", () => {
    expect(longDate("2026-12-21")).toBe("21 December 2026");
  });
});

describe("working days (WORKDAY / NETWORKDAYS)", () => {
  it("skips weekends and holidays", () => {
    expect(isWorkingDay("2026-12-25", hols)).toBe(false);
    expect(isWorkingDay("2026-12-29", hols)).toBe(true);
  });
  it("WORKDAY(Thu 24 Dec 2026, 1) = Tue 29 Dec (urgent response target)", () => {
    expect(addWorkingDays("2026-12-24", 1, hols)).toBe("2026-12-29");
  });
  it("WORKDAY(d, 0) = d and works backwards", () => {
    expect(addWorkingDays("2026-12-26", 0, hols)).toBe("2026-12-26");
    expect(addWorkingDays("2026-12-29", -1, hols)).toBe("2026-12-24");
  });
  it("WORKDAY over the New Year: 10 working days from 21 Dec 2026", () => {
    // 22,23,24,29,30,31 Dec, 4,5,6,7 Jan
    expect(addWorkingDays("2026-12-21", 10, hols)).toBe("2027-01-07");
  });
  it("NETWORKDAYS is inclusive and the registers subtract one", () => {
    expect(networkDays("2026-12-21", "2026-12-29", hols)).toBe(5);
    expect(workingDaysElapsed("2026-12-21", "2026-12-29", hols)).toBe(4);
    expect(workingDaysElapsed("2026-12-29", "2026-12-21", hols)).toBe(0);
    expect(networkDays("2026-12-29", "2026-12-21", hols)).toBe(-5);
  });
});
