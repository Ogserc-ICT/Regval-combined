/**
 * Shared helpers for the registry services.
 */
import { isLocalDate, lagosInstant, type LocalDate } from "@/domain/dates";
import { unitRecipients } from "@/domain/registry";
import { validateEmail, validatePhone } from "@/domain/validators";
import type { Settings } from "@/domain/settings";
import { auditActor, type Actor } from "../../auth/actor";
import { writeAudit } from "../../audit";
import type { Tx } from "../../db/connect";
import type { Problems } from "../../errors";
import { serverNow } from "../../time";
import type { UnitInfo } from "./ref";

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

/**
 * Acknowledgement / routing email (SPEC §25, [G9]). The email adapter and its
 * sending arrive in Phase 4; the "no address" rule applies now: when the unit
 * and its division have no email address, the save warns and the item's
 * history records "Not emailed: no address".
 */
export async function checkEmailAddress(
  tx: Tx,
  actor: Actor,
  item: { id: string; ackNo: string },
  unit: UnitInfo | null,
  settings: Pick<Settings, "ackEmailMode">,
  what: "Acknowledgement" | "Routing",
): Promise<string[]> {
  if (settings.ackEmailMode === "Off") return [];
  const to = unitRecipients(unit?.email, unit?.divisionEmail);
  if (to.length) return [];
  const unitName = unit?.name ?? "none";
  const divisionName = unit?.divisionName ?? "none";
  await writeAudit(tx, {
    actor: auditActor(actor),
    action: "Not emailed: no address",
    module: "registry",
    entityType: "inward_item",
    entityId: item.id,
    reference: item.ackNo,
    detail: `${what} email not sent: no address for unit ${unitName}, division ${divisionName}`,
  });
  return [`${what} not emailed: unit ${unitName} and division ${divisionName} have no email address. Ask an admin to add one.`];
}
