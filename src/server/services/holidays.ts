/**
 * Public holidays ([G13]; SPEC §4). Admin-editable with a status; every
 * holiday counts as non-working whatever its status.
 */
import { asc, eq } from "drizzle-orm";
import { isLocalDate, longDate } from "@/domain/dates";
import { holidaySet, type HolidaySet } from "@/domain/workdays";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import type { Db, DbOrTx } from "../db/connect";
import { HOLIDAY_STATUSES, holidays, type HolidayStatus } from "../db/schema";
import { notFound, Problems } from "../errors";

export type HolidayInput = { date: string; name: string; status: string; note?: string | null };

export async function listHolidays(db: DbOrTx) {
  return db.select().from(holidays).orderBy(asc(holidays.date));
}

export async function getHolidaySet(db: DbOrTx): Promise<HolidaySet> {
  const rows = await db.select({ date: holidays.date }).from(holidays);
  return holidaySet(rows.map((r) => r.date));
}

function check(input: HolidayInput): { date: string; name: string; status: HolidayStatus; note: string | null } {
  const p = new Problems();
  if (!isLocalDate(input.date)) p.field("date", "Enter the date as YYYY-MM-DD.");
  const name = input.name?.trim() ?? "";
  if (!name) p.field("name", "Enter the holiday's name.");
  if (!(HOLIDAY_STATUSES as readonly string[]).includes(input.status)) {
    p.field("status", `Status must be one of: ${HOLIDAY_STATUSES.join(", ")}.`);
  }
  p.throwIfAny();
  return { date: input.date, name, status: input.status as HolidayStatus, note: input.note?.trim() || null };
}

/** Add a holiday, or replace the one on that date. */
export async function saveHoliday(db: Db, actor: Actor | null, input: HolidayInput): Promise<void> {
  authorize(actor, "lists:write");
  const h = check(input);
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(holidays).where(eq(holidays.date, h.date));
    await tx
      .insert(holidays)
      .values({ ...h, updatedBy: actor.id, updatedAt: new Date() })
      .onConflictDoUpdate({ target: holidays.date, set: { name: h.name, status: h.status, note: h.note, updatedBy: actor.id, updatedAt: new Date() } });
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: existing ? "Holiday changed" : "Holiday added",
      module: "admin",
      entityType: "holiday",
      entityId: h.date,
      detail: existing
        ? `${longDate(h.date)}: ${existing.name} (${existing.status}) → ${h.name} (${h.status})`
        : `${longDate(h.date)}: ${h.name} (${h.status})`,
      data: { before: existing ?? null, after: h },
    });
  });
}

export async function deleteHoliday(db: Db, actor: Actor | null, date: string): Promise<void> {
  authorize(actor, "lists:write");
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(holidays).where(eq(holidays.date, date));
    if (!existing) throw notFound("Holiday");
    await tx.delete(holidays).where(eq(holidays.date, date));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Holiday removed",
      module: "admin",
      entityType: "holiday",
      entityId: date,
      detail: `${longDate(date)}: ${existing.name} (${existing.status})`,
      data: { before: existing },
    });
  });
}
