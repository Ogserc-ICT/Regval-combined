/**
 * Staff accounts and roles ([G2], [G6], [G7]; SPEC §27; docs/PLAN.md §6).
 * Accounts are created by an admin only; there is no self sign-up.
 * Staff names live only in these accounts, never in code.
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { validateEmail } from "@/domain/validators";
import { isRole, ROLE_LABELS, type Role } from "@/domain/roles";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit, type AuditActor } from "../audit";
import type { Db, DbOrTx, Tx } from "../db/connect";
import { accounts, sessions, units, userRoles, users } from "../db/schema";
import { blocked, notFound, Problems } from "../errors";

export const MIN_PASSWORD_LENGTH = 10;

export async function getActorById(db: DbOrTx, id: string): Promise<Actor | null> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return null;
  const roles = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, id));
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    roles: roles.map((r) => r.role).filter(isRole),
    unitId: u.unitId,
  };
}

export async function listUsers(db: DbOrTx) {
  const rows = await db.select().from(users).orderBy(asc(users.name));
  const roleRows = await db.select().from(userRoles);
  return rows.map((u) => ({
    ...u,
    roles: roleRows.filter((r) => r.userId === u.id).map((r) => r.role).filter(isRole),
  }));
}

/** A readable one-time password: 4 groups of 4 from an unambiguous alphabet. */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

function checkPassword(p: Problems, field: string, password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) p.field(field, `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > 128) p.field(field, "Use at most 128 characters.");
}

function checkRoles(p: Problems, roles: string[]): Role[] {
  const bad = roles.filter((r) => !isRole(r));
  if (bad.length) p.field("roles", `Unknown role(s): ${bad.join(", ")}`);
  return [...new Set(roles.filter(isRole))];
}

export type NewUser = {
  name: string;
  email: string;
  roles: string[];
  /** Leave blank to generate a one-time password. */
  password?: string;
  active?: boolean;
  pendingConfirmation?: boolean;
  notes?: string | null;
  /** Unit officers: the unit whose routed items they see. */
  unitId?: string | null;
};

/**
 * Creates an account (or, for the seed, inserts one as the system).
 * Returns the one-time password when it was generated, to show the admin once.
 */
export async function createUserAs(
  db: Db,
  by: AuditActor,
  input: NewUser,
): Promise<{ id: string; tempPassword: string | null }> {
  const p = new Problems();
  const name = input.name?.trim() ?? "";
  if (!name) p.field("name", "Enter the person's name.");
  const email = validateEmail(input.email ?? "");
  if (!email.ok) p.field("email", email.message);
  const roles = checkRoles(p, input.roles ?? []);
  const generated = !input.password;
  const password = input.password || generateTempPassword();
  if (!generated) checkPassword(p, "password", password);
  p.throwIfAny();
  const emailValue = (email as { value: string }).value.toLowerCase();

  const hash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [clash] = await tx.select({ id: users.id }).from(users).where(eq(users.email, emailValue));
    if (clash) new Problems().field("email", "Another account already uses this email.").throwIfAny();
    const [u] = await tx
      .insert(users)
      .values({
        name,
        email: emailValue,
        emailVerified: true,
        active: input.active ?? true,
        mustChangePassword: true,
        pendingConfirmation: input.pendingConfirmation ?? false,
        notes: input.notes ?? null,
        unitId: input.unitId || null,
      })
      .returning({ id: users.id });
    await tx.insert(accounts).values({ accountId: u.id, providerId: "credential", userId: u.id, password: hash });
    if (roles.length) await tx.insert(userRoles).values(roles.map((role) => ({ userId: u.id, role, grantedBy: by.id })));
    await writeAudit(tx, {
      actor: by,
      action: "User created",
      module: "admin",
      entityType: "user",
      entityId: u.id,
      detail: `${name} <${emailValue}>; roles: ${roles.map((r) => ROLE_LABELS[r]).join(", ") || "none"}${input.active === false ? "; inactive" : ""}${input.pendingConfirmation ? "; seeded, awaiting confirmation" : ""}`,
      data: { name, email: emailValue, roles, active: input.active ?? true },
    });
    return { id: u.id, tempPassword: generated ? password : null };
  });
}

export async function createUser(db: Db, actor: Actor | null, input: NewUser) {
  authorize(actor, "users:manage");
  return createUserAs(db, auditActor(actor), input);
}

async function activeAdminCount(tx: Tx, excludingUserId?: string): Promise<number> {
  const res = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(
      and(
        eq(userRoles.role, "admin"),
        eq(users.active, true),
        excludingUserId ? ne(users.id, excludingUserId) : undefined,
      ),
    );
  return res[0]?.n ?? 0;
}

export type UserUpdate = {
  name?: string;
  email?: string;
  active?: boolean;
  /** Admin confirms a seeded account. */
  confirm?: boolean;
  roles?: string[];
  notes?: string | null;
  unitId?: string | null;
};

export async function updateUser(db: Db, actor: Actor | null, userId: string, input: UserUpdate): Promise<void> {
  authorize(actor, "users:manage");
  const p = new Problems();
  const name = input.name === undefined ? undefined : input.name.trim();
  if (name !== undefined && !name) p.field("name", "Enter the person's name.");
  let email: string | undefined;
  if (input.email !== undefined) {
    const e = validateEmail(input.email);
    if (!e.ok) p.field("email", e.message);
    else email = e.value.toLowerCase();
  }
  const roles = input.roles === undefined ? undefined : checkRoles(p, input.roles);
  p.throwIfAny();

  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!u) throw notFound("User");
    const before = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    const beforeRoles = before.map((r) => r.role).filter(isRole);

    if (email && email !== u.email) {
      const [clash] = await tx.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, userId)));
      if (clash) new Problems().field("email", "Another account already uses this email.").throwIfAny();
    }
    const losesAdmin =
      beforeRoles.includes("admin") && u.active &&
      ((roles !== undefined && !roles.includes("admin")) || input.active === false);
    if (losesAdmin && (await activeAdminCount(tx, userId)) === 0) {
      throw blocked("There must always be at least one active admin.");
    }

    const changes: string[] = [];
    const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined && name !== u.name) { set.name = name; changes.push(`name: ${u.name} → ${name}`); }
    if (email !== undefined && email !== u.email) { set.email = email; changes.push(`email: ${u.email} → ${email}`); }
    if (input.active !== undefined && input.active !== u.active) { set.active = input.active; changes.push(input.active ? "activated" : "deactivated"); }
    if (input.confirm && u.pendingConfirmation) { set.pendingConfirmation = false; changes.push("confirmed"); }
    if (input.notes !== undefined && (input.notes ?? null) !== u.notes) { set.notes = input.notes; changes.push("notes changed"); }
    if (input.unitId !== undefined && (input.unitId || null) !== u.unitId) {
      const unitName = async (id: string | null) => (id ? ((await tx.select({ n: units.name }).from(units).where(eq(units.id, id)))[0]?.n ?? "?") : "none");
      changes.push(`unit: ${await unitName(u.unitId)} → ${await unitName(input.unitId || null)}`);
      set.unitId = input.unitId || null;
    }
    await tx.update(users).set(set).where(eq(users.id, userId));

    if (roles !== undefined) {
      const added = roles.filter((r) => !beforeRoles.includes(r));
      const removed = beforeRoles.filter((r) => !roles.includes(r));
      if (removed.length) await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.role, removed)));
      if (added.length) await tx.insert(userRoles).values(added.map((role) => ({ userId, role, grantedBy: actor.id })));
      if (added.length) changes.push(`roles added: ${added.map((r) => ROLE_LABELS[r]).join(", ")}`);
      if (removed.length) changes.push(`roles removed: ${removed.map((r) => ROLE_LABELS[r]).join(", ")}`);
    }
    if (input.active === false) await tx.delete(sessions).where(eq(sessions.userId, userId));
    if (changes.length) {
      await writeAudit(tx, {
        actor: auditActor(actor),
        action: "User changed",
        module: "admin",
        entityType: "user",
        entityId: userId,
        detail: `${name ?? u.name}: ${changes.join("; ")}`,
      });
    }
  });
}

/** Admin sets a new one-time password; the user must change it at next sign-in. */
export async function resetPassword(db: Db, actor: Actor | null, userId: string): Promise<string> {
  authorize(actor, "users:manage");
  const temp = generateTempPassword();
  const hash = await hashPassword(temp);
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) throw notFound("User");
    const updated = await tx
      .update(accounts)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
      .returning({ id: accounts.id });
    if (updated.length === 0) {
      await tx.insert(accounts).values({ accountId: userId, providerId: "credential", userId, password: hash });
    }
    await tx.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Password reset",
      module: "admin",
      entityType: "user",
      entityId: userId,
      detail: `${u.name}: one-time password issued; signed out everywhere`,
    });
  });
  return temp;
}

/** Called after the user changes their own password through Better Auth. */
export async function markPasswordChanged(db: Db, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, actor.id));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Password changed",
      module: "auth",
      entityType: "user",
      entityId: actor.id,
      detail: actor.name,
    });
  });
}
