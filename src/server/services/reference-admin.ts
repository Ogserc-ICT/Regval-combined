/**
 * Admin editing of reference data (docs/PLAN.md §7 Admin): the Schedule 3 fee
 * table, the activity map, divisions and units with their emails ([G9]),
 * correspondence types and the drop-down lists. Every change is audited
 * old → new. Rows that records point at are deactivated, never deleted, and
 * list values are never renamed (records store the text).
 *
 * Forms, Schedule 2 documents, document conditions and EVAL-01 checks come
 * from the Order and stay read-only.
 */
import { and, asc, eq, max, ne } from "drizzle-orm";
import { formatNaira } from "@/domain/money";
import { validateEmail } from "@/domain/validators";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import type { Db, Tx } from "../db/connect";
import { activities, correspondenceTypes, divisions, feeSchedule, listItems, units } from "../db/schema";
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

/** Addresses separated by ";" or ","; each must be valid. Returns the cleaned cell. */
export function cleanEmails(p: Problems, field: string, value: string | null | undefined): string | null {
  const parts = (value ?? "")
    .split(/[;,]/)
    .map((a) => a.trim())
    .filter(Boolean);
  const bad = parts.filter((a) => !validateEmail(a).ok);
  if (bad.length) p.field(field, `Not valid email address(es): ${bad.join(", ")}`);
  return parts.length ? parts.join("; ") : null;
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

// ------------------------------------------------------------------ divisions and units

export async function saveDivision(db: Db, actor: Actor | null, id: string | null, input: { name: string; email: string | null }): Promise<string> {
  authorize(actor, "lists:write");
  const p = new Problems();
  const name = t(input.name);
  if (!name) p.field("name", "Name is required.");
  const email = cleanEmails(p, "email", input.email);
  p.throwIfAny();
  return db.transaction(async (tx) => {
    const [clash] = await tx.select({ id: divisions.id }).from(divisions).where(and(eq(divisions.name, name!), id ? ne(divisions.id, id) : undefined));
    if (clash) new Problems().field("name", "Another division has this name.").throwIfAny();
    if (!id) {
      const [{ m }] = await tx.select({ m: max(divisions.sort) }).from(divisions);
      const [row] = await tx.insert(divisions).values({ name: name!, email, sort: (m ?? 0) + 1 }).returning({ id: divisions.id });
      await audit(tx, actor, "Division added", name!, [`email: ${email ?? "—"}`]);
      return row.id;
    }
    const [row] = await tx.select().from(divisions).where(eq(divisions.id, id)).for("update");
    if (!row) throw notFound("Division");
    const c = diff(row, { name, email }, { name: "name", email: "email" });
    if (c.length) {
      await tx.update(divisions).set({ name: name!, email }).where(eq(divisions.id, id));
      await audit(tx, actor, "Division changed", row.name, c);
    }
    return id;
  });
}

export type UnitInput = { name: string; divisionId: string | null; unitGroup: string | null; email: string | null; active: boolean };

export async function saveUnit(db: Db, actor: Actor | null, id: string | null, input: UnitInput): Promise<string> {
  authorize(actor, "lists:write");
  const p = new Problems();
  const name = t(input.name);
  if (!name) p.field("name", "Name is required.");
  const email = cleanEmails(p, "email", input.email);
  p.throwIfAny();
  return db.transaction(async (tx) => {
    const divisionId = t(input.divisionId);
    if (divisionId && !(await tx.select({ id: divisions.id }).from(divisions).where(eq(divisions.id, divisionId))).length) {
      new Problems().field("divisionId", "Choose the division from the list.").throwIfAny();
    }
    const [clash] = await tx.select({ id: units.id }).from(units).where(and(eq(units.name, name!), id ? ne(units.id, id) : undefined));
    if (clash) new Problems().field("name", "Another unit has this name.").throwIfAny();
    const values = { name: name!, divisionId, unitGroup: t(input.unitGroup), email, active: input.active };
    if (!id) {
      const [{ m }] = await tx.select({ m: max(units.sort) }).from(units);
      const [row] = await tx.insert(units).values({ ...values, sort: (m ?? 0) + 1 }).returning({ id: units.id });
      await audit(tx, actor, "Unit added", name!, [`email: ${email ?? "—"}`]);
      return row.id;
    }
    const [row] = await tx.select().from(units).where(eq(units.id, id)).for("update");
    if (!row) throw notFound("Unit");
    const c = diff(row, values, { name: "name", divisionId: "division", unitGroup: "group", email: "email", active: "active" });
    if (c.length) {
      await tx.update(units).set(values).where(eq(units.id, id));
      await audit(tx, actor, "Unit changed", row.name, c);
    }
    return id;
  });
}

// ------------------------------------------------------------------ correspondence types

export type TypeInput = {
  name: string;
  category: string;
  defaultUnitId: string | null;
  orderRef: string | null;
  responseTargetDays: number;
  para103Wording: boolean;
  active: boolean;
};

/** Registration filing types (NEW, UPDATE, ANNUAL, OWNUSE) keep their filing mapping; it cannot be set here. */
export async function saveCorrespondenceType(db: Db, actor: Actor | null, id: string | null, input: TypeInput): Promise<string> {
  authorize(actor, "lists:write");
  const p = new Problems();
  const name = t(input.name);
  if (!name) p.field("name", "Name is required.");
  const category = t(input.category);
  if (!category) p.field("category", "Category is required.");
  if (!Number.isInteger(input.responseTargetDays) || input.responseTargetDays < 0 || input.responseTargetDays > 365) {
    p.field("responseTargetDays", "Working days, 0 to 365 (0 = no response target).");
  }
  p.throwIfAny();
  return db.transaction(async (tx) => {
    const unitId = t(input.defaultUnitId);
    if (unitId && !(await tx.select({ id: units.id }).from(units).where(eq(units.id, unitId))).length) {
      new Problems().field("defaultUnitId", "Choose the unit from the list.").throwIfAny();
    }
    const [clash] = await tx.select({ id: correspondenceTypes.id }).from(correspondenceTypes).where(and(eq(correspondenceTypes.name, name!), id ? ne(correspondenceTypes.id, id) : undefined));
    if (clash) new Problems().field("name", "Another type has this name.").throwIfAny();
    const values = { name: name!, category: category!, defaultUnitId: unitId, orderRef: t(input.orderRef), responseTargetDays: input.responseTargetDays, para103Wording: input.para103Wording, active: input.active };
    if (!id) {
      const [{ m }] = await tx.select({ m: max(correspondenceTypes.sort) }).from(correspondenceTypes);
      const [row] = await tx.insert(correspondenceTypes).values({ ...values, sort: (m ?? 0) + 1 }).returning({ id: correspondenceTypes.id });
      await audit(tx, actor, "Correspondence type added", name!, [`${category}; target ${input.responseTargetDays} working days`]);
      return row.id;
    }
    const [row] = await tx.select().from(correspondenceTypes).where(eq(correspondenceTypes.id, id)).for("update");
    if (!row) throw notFound("Correspondence type");
    if (row.filingType && !input.active) throw blocked(`${row.name} is a registration filing type and cannot be switched off.`);
    const c = diff(row, values, {
      name: "name",
      category: "category",
      defaultUnitId: "default unit",
      orderRef: "Order ref",
      responseTargetDays: "response target (working days)",
      para103Wording: "para 10(3) wording",
      active: "active",
    });
    if (c.length) {
      await tx.update(correspondenceTypes).set(values).where(eq(correspondenceTypes.id, id));
      await audit(tx, actor, "Correspondence type changed", row.name, c);
    }
    return id;
  });
}

// ------------------------------------------------------------------ simple lists

/** The admin-editable drop-down lists, with what each `meta` holds. */
export const EDITABLE_LISTS: Record<string, { label: string; meta?: "code" | "channel" | "outgoing"; locked?: string[] }> = {
  lga: { label: "LGAs (Register)" },
  registry_lga: { label: "LGAs (Registry, incl. outside Ogun)" },
  registrant_type: { label: "Registrant types" },
  licence_status: { label: "Licence statuses" },
  submission_channel: { label: "Submission channels", locked: ["By hand", "Email", "Online portal"] },
  payment_channel: { label: "Payment channels" },
  payment_purpose: { label: "Payment purposes" },
  fuel: { label: "Fuels (own-use)" },
  refusal_ground: { label: "Refusal grounds" },
  ack_issued_via: { label: "Acknowledgement issued via", locked: ["Not yet issued"] },
  sender_category: { label: "Sender / recipient categories", locked: ["Registrant / licensee"] },
  action_required: { label: "Actions required", locked: ["For information", "File only"] },
  priority: { label: "Priorities", locked: ["Urgent", "Normal"] },
  security: { label: "File security", locked: ["Open"] },
  file_status: { label: "File statuses", locked: ["Open"] },
  mode_of_receipt: { label: "Modes of receipt / dispatch", meta: "channel", locked: ["Hand delivery", "Email", "Online portal"] },
  file_class: { label: "File classes", meta: "code" },
  outgoing_type: { label: "Outgoing document types", meta: "outgoing", locked: ["Reply to correspondence"] },
};

export type ListItemInput = {
  value: string;
  active?: boolean;
  /** file_class: code; mode_of_receipt: channel; outgoing_type: response expected + days. */
  code?: string | null;
  channel?: string | null;
  responseExpected?: boolean;
  responseDays?: number;
};

async function metaFor(tx: Tx, p: Problems, listKey: string, value: string, input: ListItemInput): Promise<string | null> {
  const kind = EDITABLE_LISTS[listKey].meta;
  if (kind === "code") {
    const code = (input.code ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(code)) p.field("code", "Code: 2 to 5 capital letters (used in file references).");
    const rows = await tx.select({ value: listItems.value, meta: listItems.meta }).from(listItems).where(eq(listItems.listKey, "file_class"));
    if (rows.some((r) => r.meta === code && r.value !== value)) p.field("code", `Code ${code} is already used by another class.`);
    return code;
  }
  if (kind === "channel") {
    const channels = (await tx.select({ v: listItems.value }).from(listItems).where(eq(listItems.listKey, "submission_channel"))).map((r) => r.v);
    const ch = t(input.channel);
    if (!ch || !channels.includes(ch)) p.field("channel", "Choose the Register channel this mode maps to.");
    return ch;
  }
  if (kind === "outgoing") {
    const days = input.responseDays ?? 0;
    if (!Number.isInteger(days) || days < 0 || days > 365) p.field("responseDays", "Working days, 0 to 365.");
    return JSON.stringify({ responseExpected: !!input.responseExpected, responseDays: days });
  }
  return null;
}

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
    const meta = await metaFor(tx, p, listKey, value ?? "", input);
    p.throwIfAny();
    const [{ m }] = await tx.select({ m: max(listItems.sort) }).from(listItems).where(eq(listItems.listKey, listKey));
    await tx.insert(listItems).values({ listKey, value: value!, sort: (m ?? 0) + 1, meta, active: true });
    await audit(tx, actor, "List item added", EDITABLE_LISTS[listKey].label, [`${value}${meta ? ` (${meta})` : ""}`]);
  });
}

/** Switch on/off and change the meta. The value itself never changes. */
export async function updateListItem(db: Db, actor: Actor | null, listKey: string, value: string, input: ListItemInput): Promise<string[]> {
  authorize(actor, "lists:write");
  const def = EDITABLE_LISTS[listKey];
  if (!def) throw notFound("List");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(listItems).where(and(eq(listItems.listKey, listKey), eq(listItems.value, value))).for("update");
    if (!row) throw notFound("List item");
    if (input.active === false && def.locked?.includes(value)) throw blocked(`"${value}" is used by the rules and cannot be switched off.`);
    const p = new Problems();
    const meta = def.meta ? await metaFor(tx, p, listKey, value, input) : row.meta;
    p.throwIfAny();
    if (listKey === "file_class" && meta !== row.meta) throw blocked("A file class code cannot change: existing file references use it. Add a new class instead.");
    const next = { active: input.active ?? row.active, meta };
    const c = diff(row, next, { active: "active", meta: "settings" });
    if (!c.length) return [];
    await tx.update(listItems).set(next).where(and(eq(listItems.listKey, listKey), eq(listItems.value, value)));
    await audit(tx, actor, "List item changed", `${def.label}: ${value}`, c);
    return c;
  });
}

export async function listEditable(db: Db) {
  return db.select().from(listItems).orderBy(asc(listItems.listKey), asc(listItems.sort));
}
