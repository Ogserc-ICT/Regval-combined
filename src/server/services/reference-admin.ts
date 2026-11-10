/**
 * Admin editing of reference data (docs/PLAN.md §7 Admin): the Schedule 3 fee
 * table, the activity map and the drop-down lists. Every change is audited
 * old → new. Rows that records point at are deactivated, never deleted, and
 * list values are never renamed (records store the text).
 *
 * Forms, Schedule 2 documents, document conditions and EVAL-01 checks come
 * from the Order and stay read-only.
 */
import { and, asc, eq, max } from "drizzle-orm";
import { formatNaira } from "@/domain/money";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import type { Db, Tx } from "../db/connect";
import { activities, feeSchedule, listItems } from "../db/schema";
import { blocked, notFound, Problems } from "../errors";
import { lagosToday } from "../time";
import { updateSettings } from "./settings";

const t = (v: string | null | undefined) => (v ?? "").trim() || null;

function diff(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(after)) {
    const b = before[k] ?? null;
    if ((b ?? null) !== (v ?? null)) out.push(`${labels[k] ?? k}: ${b ?? "—"} → ${v ?? "—"}`);
  }
  return out;
}

async function audit(tx: Tx, actor: Actor, action: string, reference: string, changes: string[]) {
  await writeAudit(tx, { actor: auditActor(actor), action, module: "admin", entityType: "reference", reference, detail: changes.join("; ") });
}

// ------------------------------------------------------------------ fees

export type FeeInput = { registrationFee: number; lateInitial: number; lateDaily: number; lateCap: number; description: string };

/**
 * Changes one Schedule 3 row. Saved submissions keep their frozen pricing and
 * are flagged "pricing out of date" (Q6); "Fees revised on" is set to today.
 */
export async function updateFee(db: Db, actor: Actor | null, category: string, input: FeeInput): Promise<string[]> {
  authorize(actor, "lists:write");
  const p = new Problems();
  for (const k of ["registrationFee", "lateInitial", "lateDaily", "lateCap"] as const) {
    if (!Number.isInteger(input[k]) || input[k] < 0) p.field(k, "Enter an amount in naira (0 or more).");
  }
  if (!t(input.description)) p.field("description", "Description is required.");
  p.throwIfAny();
  const changes = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(feeSchedule).where(eq(feeSchedule.category, category)).for("update");
    if (!row) throw notFound("Fee category");
    const next = { registrationFee: input.registrationFee, lateInitial: input.lateInitial, lateDaily: input.lateDaily, lateCap: input.lateCap, description: t(input.description)! };
    const money = (k: keyof typeof next) => (typeof next[k] === "number" ? formatNaira(next[k] as number) : next[k]);
    const c = Object.keys(next)
      .filter((k) => (row as Record<string, unknown>)[k] !== next[k as keyof typeof next])
      .map((k) => {
        const b = (row as Record<string, unknown>)[k];
        return `${k}: ${typeof b === "number" ? formatNaira(b) : b} → ${money(k as keyof typeof next)}`;
      });
    if (!c.length) return [];
    await tx.update(feeSchedule).set({ ...next, updatedAt: new Date() }).where(eq(feeSchedule.category, category));
    await audit(tx, actor, "Fee table changed", `Category ${category}`, c);
    return c;
  });
  if (changes.length) await updateSettings(db, actor, { feesRevisedOn: lagosToday() });
  return changes;
}

// ------------------------------------------------------------------ activities

export type ActivityInput = { cat10MwPlus: string; cat1To10Mw: string; catBelow1Mw: string; capacityBased: boolean; active: boolean };

export async function updateActivity(db: Db, actor: Actor | null, code: string, input: ActivityInput): Promise<string[]> {
  authorize(actor, "lists:write");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(activities).where(eq(activities.code, code)).for("update");
    if (!row) throw notFound("Activity");
    const cats = (await tx.select({ c: feeSchedule.category }).from(feeSchedule)).map((r) => r.c);
    const p = new Problems();
    for (const k of ["cat10MwPlus", "cat1To10Mw", "catBelow1Mw"] as const) if (!cats.includes(input[k])) p.field(k, "Choose a Schedule 3 category.");
    p.throwIfAny();
    const c = diff(row, input, { cat10MwPlus: "10 MW+", cat1To10Mw: "1–10 MW", catBelow1Mw: "below 1 MW", capacityBased: "capacity-based", active: "active" });
    if (!c.length) return [];
    await tx.update(activities).set(input).where(eq(activities.code, code));
    await audit(tx, actor, "Activity map changed", `${row.name} (${code})`, c);
    return c;
  });
}

// ------------------------------------------------------------------ simple lists

/** The admin-editable drop-down lists. Values the rules rely on cannot be switched off. */
export const EDITABLE_LISTS: Record<string, { label: string; locked?: string[] }> = {
  lga: { label: "LGAs" },
  registrant_type: { label: "Registrant types" },
  licence_status: { label: "Licence statuses" },
  submission_channel: { label: "Submission channels", locked: ["By hand", "Email", "Online portal"] },
  payment_channel: { label: "Payment channels" },
  payment_purpose: { label: "Payment purposes" },
  fuel: { label: "Fuels (own-use)" },
  refusal_ground: { label: "Refusal grounds" },
};

export type ListItemInput = { value: string; active?: boolean };

export async function addListItem(db: Db, actor: Actor | null, listKey: string, input: ListItemInput): Promise<void> {
  authorize(actor, "lists:write");
  if (!EDITABLE_LISTS[listKey]) throw notFound("List");
  await db.transaction(async (tx) => {
    const p = new Problems();
    const value = t(input.value);
    if (!value) p.field("value", "Enter the value.");
    else if ((await tx.select({ v: listItems.value }).from(listItems).where(and(eq(listItems.listKey, listKey), eq(listItems.value, value)))).length) {
      p.field("value", "Already on the list (switch it back on instead).");
    }
    p.throwIfAny();
    const [{ m }] = await tx.select({ m: max(listItems.sort) }).from(listItems).where(eq(listItems.listKey, listKey));
    await tx.insert(listItems).values({ listKey, value: value!, sort: (m ?? 0) + 1, active: true });
    await audit(tx, actor, "List item added", EDITABLE_LISTS[listKey].label, [value!]);
  });
}

/** Switch on/off. The value itself never changes (records store the text). */
export async function updateListItem(db: Db, actor: Actor | null, listKey: string, value: string, input: ListItemInput): Promise<string[]> {
  authorize(actor, "lists:write");
  const def = EDITABLE_LISTS[listKey];
  if (!def) throw notFound("List");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(listItems).where(and(eq(listItems.listKey, listKey), eq(listItems.value, value))).for("update");
    if (!row) throw notFound("List item");
    if (input.active === false && def.locked?.includes(value)) throw blocked(`"${value}" is used by the rules and cannot be switched off.`);
    const next = { active: input.active ?? row.active };
    const c = diff(row, next, { active: "active" });
    if (!c.length) return [];
    await tx.update(listItems).set(next).where(and(eq(listItems.listKey, listKey), eq(listItems.value, value)));
    await audit(tx, actor, "List item changed", `${def.label}: ${value}`, c);
    return c;
  });
}

export async function listEditable(db: Db) {
  const rows = await db.select().from(listItems).orderBy(asc(listItems.listKey), asc(listItems.sort));
  return rows.filter((r) => r.listKey in EDITABLE_LISTS);
}
