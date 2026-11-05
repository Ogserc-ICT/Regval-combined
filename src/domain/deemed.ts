/**
 * Deemed receipt date, para 10(3) (SPEC §4.1; Inward Register column G).
 *
 *   received on a weekend or holiday                  → next working day
 *   Email / Online portal at or after the closing time → next working day
 *   otherwise                                          → the date received
 *
 * The cut-off applies to electronic items only (Q1, decided 6 Nov 2026).
 */
import { lagosDate, lagosMinuteOfDay, minutesOf, type LocalDate } from "./dates";
import { isWorkingDay, nextWorkingDay, type HolidaySet } from "./workdays";

/** Modes of receipt the closing-time cut-off applies to. */
export const ELECTRONIC_MODES: ReadonlySet<string> = new Set(["Email", "Online portal"]);

export function isElectronicMode(mode: string): boolean {
  return ELECTRONIC_MODES.has(mode.trim());
}

export type DeemedReceiptInput = {
  /** When the item was received (an instant; converted to Lagos time). */
  receivedAt: Date;
  /** Mode of receipt, e.g. "Hand delivery", "Email", "Online portal". */
  mode: string;
  /** Office closing time "HH:MM" (Registry Settings B7; default 17:00). */
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
