/**
 * Working days (SPEC §4): Monday–Friday and not a holiday. Every holiday
 * counts as non-working whatever its status (Fixed / Provisional / Estimated).
 * These mirror Excel's WORKDAY and NETWORKDAYS used across the Registry sheets.
 */
import { addDays, compareDates, isoWeekday, type LocalDate } from "./dates";

export type HolidaySet = ReadonlySet<LocalDate>;

export function holidaySet(dates: Iterable<LocalDate>): HolidaySet {
  return new Set(dates);
}

export function isWorkingDay(date: LocalDate, holidays: HolidaySet): boolean {
  return isoWeekday(date) <= 5 && !holidays.has(date);
}

/**
 * Excel WORKDAY(start, n, Hols): the nth working day after `start`
 * (before it when n < 0). n = 0 returns `start` unchanged.
 */
export function addWorkingDays(start: LocalDate, n: number, holidays: HolidaySet): LocalDate {
  if (!Number.isInteger(n)) throw new RangeError("Working days must be a whole number");
  let date = start;
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    date = addDays(date, step);
    if (isWorkingDay(date, holidays)) left -= 1;
  }
  return date;
}

/** The next working day strictly after `date` (WORKDAY(date, 1)). */
export function nextWorkingDay(date: LocalDate, holidays: HolidaySet): LocalDate {
  return addWorkingDays(date, 1, holidays);
}

/**
 * Excel NETWORKDAYS(a, b, Hols): working days from a to b inclusive;
 * negative when b is before a.
 */
export function networkDays(a: LocalDate, b: LocalDate, holidays: HolidaySet): number {
  const cmp = compareDates(a, b);
  if (cmp === 0) return isWorkingDay(a, holidays) ? 1 : 0;
  const [from, to, sign] = cmp < 0 ? [a, b, 1] : [b, a, -1];
  let count = 0;
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) {
    if (isWorkingDay(d, holidays)) count += 1;
  }
  return sign * count;
}

/**
 * Working days elapsed between two dates, as the registers show them:
 * MAX(0, NETWORKDAYS(a, b, Hols) − 1).
 */
export function workingDaysElapsed(a: LocalDate, b: LocalDate, holidays: HolidaySet): number {
  return Math.max(0, networkDays(a, b, holidays) - 1);
}
