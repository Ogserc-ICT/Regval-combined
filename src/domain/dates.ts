/**
 * Calendar dates and Africa/Lagos time (SPEC §4, [G13]).
 *
 * A calendar date is an ISO string "YYYY-MM-DD" (a Lagos date). Instants are
 * JavaScript Dates (UTC). Everything here is pure: callers pass "now" in, so
 * the server decides what "today" is (see src/server/time.ts).
 */
import { TZDate } from "@date-fns/tz";

export const LAGOS_TZ = "Africa/Lagos";

/** A Lagos calendar date, "YYYY-MM-DD". */
export type LocalDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function parts(date: LocalDate): [number, number, number] {
  const m = ISO_DATE.exec(date);
  if (!m || !isLocalDate(date)) throw new RangeError(`Not a calendar date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fromUtcMidnight(ms: number): LocalDate {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function toUtcMidnight(date: LocalDate): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 86_400_000;

/** date + n calendar days (n may be negative). */
export function addDays(date: LocalDate, n: number): LocalDate {
  return fromUtcMidnight(toUtcMidnight(date) + n * DAY_MS);
}

/** b − a in calendar days. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMidnight(b) - toUtcMidnight(a)) / DAY_MS);
}

/** ISO weekday: Monday = 1 … Sunday = 7 (Excel WEEKDAY(d, 2)). */
export function isoWeekday(date: LocalDate): number {
  const dow = new Date(toUtcMidnight(date)).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

export function yearOf(date: LocalDate): number {
  return parts(date)[0];
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The Lagos calendar date of an instant. */
export function lagosDate(instant: Date): LocalDate {
  const z = new TZDate(instant.getTime(), LAGOS_TZ);
  const mo = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return `${z.getFullYear()}-${mo}-${d}`;
}

/** Minutes since Lagos midnight of an instant (0 … 1439). */
export function lagosMinuteOfDay(instant: Date): number {
  const z = new TZDate(instant.getTime(), LAGOS_TZ);
  return z.getHours() * 60 + z.getMinutes();
}

/** The instant for a Lagos wall-clock date and time ("HH:MM" or "HH:MM:SS"). */
export function lagosInstant(date: LocalDate, time = "00:00"): Date {
  const [y, m, d] = parts(date);
  const [hh, mm, ss] = time.split(":").map(Number);
  const z = new TZDate(y, m - 1, d, hh ?? 0, mm ?? 0, ss ?? 0, LAGOS_TZ);
  return new Date(z.getTime());
}

/** "HH:MM" → minutes since midnight. */
export function minutesOf(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) throw new RangeError(`Not a time: ${time}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new RangeError(`Not a time: ${time}`);
  return h * 60 + min;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "21 December 2026" (modCommon.LongDate). */
export function longDate(date: LocalDate): string {
  const [y, m, d] = parts(date);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "21-Dec-2026". */
export function shortDate(date: LocalDate): string {
  const [y, m, d] = parts(date);
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1].slice(0, 3)}-${y}`;
}

/** "21-Dec-2026 17:30" in Lagos time. */
export function lagosDateTime(instant: Date): string {
  const mins = lagosMinuteOfDay(instant);
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${shortDate(lagosDate(instant))} ${hh}:${mm}`;
}
