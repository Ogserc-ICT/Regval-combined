/**
 * Shared helpers for the registry services.
 */
import { isLocalDate, lagosInstant, type LocalDate } from "@/domain/dates";
import { validateEmail, validatePhone } from "@/domain/validators";
import type { Problems } from "../../errors";
import { serverNow } from "../../time";

export const t = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/** "Received" date + time typed in Lagos time → an instant; not in the future. */
export function receivedInstant(p: Problems, date: string | null | undefined, time: string | null | undefined, field = "receivedDate"): Date | null {
  if (!date || !isLocalDate(date)) {
    p.field(field, "Date received is required (YYYY-MM-DD).");
    return null;
  }
  const tm = (time ?? "").trim() || "00:00";
  if (!/^\d{1,2}:\d{2}$/.test(tm)) {
    p.field("receivedTime", "Time must be HH:MM (24-hour, Lagos time).");
    return null;
  }
  const at = lagosInstant(date, tm);
  if (at.getTime() > serverNow().getTime() + 5 * 60_000) {
    p.field(field, "The date and time received cannot be in the future.");
    return null;
  }
  return at;
}

export function optionalDate(p: Problems, field: string, value: string | null | undefined, label: string): LocalDate | null {
  const v = t(value);
  if (!v) return null;
  if (!isLocalDate(v)) {
    p.field(field, `${label} must be a date (YYYY-MM-DD).`);
    return null;
  }
  return v;
}

export function optionalPhone(p: Problems, value: string | null | undefined, field = "phone"): string | null {
  const v = t(value);
  if (!v) return null;
  const r = validatePhone(v);
  if (!r.ok) {
    p.field(field, r.message);
    return null;
  }
  return r.value;
}

export function optionalEmail(p: Problems, value: string | null | undefined, field = "email"): string | null {
  const v = t(value);
  if (!v) return null;
  if (!validateEmail(v).ok) {
    p.field(field, "Email address is not valid.");
    return null;
  }
  return v;
}

export function optionalCount(p: Problems, field: string, value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    p.field(field, `${label} must be a whole number (0 or more).`);
    return null;
  }
  return value;
}

export function inList(p: Problems, field: string, value: string | null | undefined, list: readonly string[], label: string, required = true): string | null {
  const v = t(value);
  if (!v) {
    if (required) p.field(field, `${label} is required.`);
    return null;
  }
  if (!list.includes(v)) {
    p.field(field, `${label}: choose from the list.`);
    return null;
  }
  return v;
}
