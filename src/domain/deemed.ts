/**
 * Deemed receipt date, para 10(3) (SPEC §4.1), for every submission and
 * own-use notification (in the workbook only the Registry calculated it).
 *
 *   received on a weekend or holiday                  → next working day
 *   Email / Online portal at or after the closing time → next working day
 *   otherwise                                          → the date received
 *
 * The cut-off applies to electronic channels only (Q1, decided 6 Nov 2026).
 */
import { lagosDate, lagosMinuteOfDay, minutesOf, type LocalDate } from "./dates";
import { isWorkingDay, nextWorkingDay, type HolidaySet } from "./workdays";

/** Channels the closing-time cut-off applies to. */
export const ELECTRONIC_MODES: ReadonlySet<string> = new Set(["Email", "Online portal"]);

export function isElectronicMode(mode: string): boolean {
  return ELECTRONIC_MODES.has(mode.trim());
}

export type DeemedReceiptInput = {
  /** When the item was received (an instant; converted to Lagos time). */
  receivedAt: Date;
  /** Submission channel: "By hand", "Email" or "Online portal". */
  mode: string;
  /** Office closing time "HH:MM" (Admin › Settings; default 17:00). */
  closingTime: string;
  holidays: HolidaySet;
};

export function deemedReceiptDate(input: DeemedReceiptInput): LocalDate {
  const date = lagosDate(input.receivedAt);
  if (!isWorkingDay(date, input.holidays)) return nextWorkingDay(date, input.holidays);
  if (
    isElectronicMode(input.mode) &&
    lagosMinuteOfDay(input.receivedAt) >= minutesOf(input.closingTime)
  ) {
    return nextWorkingDay(date, input.holidays);
  }
  return date;
}
