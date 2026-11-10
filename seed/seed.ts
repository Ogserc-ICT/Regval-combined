/**
 * Idempotent seed (docs/PLAN.md §9). Safe to run on every deploy:
 *  - reference data: holidays (inserted only if missing; admin edits are kept)
 *  - the first admin, from BOOTSTRAP_ADMIN_* when no active admin exists
 *  - development and preview only: the workbook's Registry staff, seeded before Phase 9,
 *    are marked deleted (the Registry left this app). Production is never touched.
 *
 * There are no EXAMPLE rows to seed: the workbook's EXAMPLE rows were all Registry records.
 *
 * Usage: pnpm db:seed
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createDb, type Db } from "../src/server/db/connect";
import { directDatabaseUrl, missingDatabaseMessage } from "../src/server/db/env";
import { accounts, formDrafts, holidays, notifications, sessions, signatories, userRoles, users } from "../src/server/db/schema";
import { writeAudit, type AuditActor } from "../src/server/audit";
import { createUserAs } from "../src/server/services/users";
import { isProductionEnv } from "../src/server/seed-guard";
import { seedReference } from "./reference";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const SEED: AuditActor = { id: null, name: "Seed" };

type HolidayRow = { date: string; name: string; status: "Fixed" | "Provisional" | "Estimated" | "State-declared"; note?: string };

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "seed", "data", file), "utf8")) as T;
}


export async function seedHolidays(db: Db): Promise<number> {
  const rows = readJson<HolidayRow[]>("holidays.json");
  let added = 0;
  await db.transaction(async (tx) => {
    for (const h of rows) {
      const inserted = await tx
        .insert(holidays)
        .values({ date: h.date, name: h.name, status: h.status, note: h.note ?? null })
        .onConflictDoNothing()
        .returning({ date: holidays.date });
      added += inserted.length;
    }
    if (added) {
      await writeAudit(tx, { actor: SEED, action: "Holidays seeded", module: "system", detail: `${added} holiday(s) from Registry Settings A21:D36` });
    }
  });
  return added;
}

/**
 * Development and preview only: the workbook's Registry staff (seeded before Phase 9) are marked
 * deleted, as Admin › Staff would, and their unconfirmed signatory rows switched off. The names
 * come from seed/data, never from code. Production is never touched.
 */
export async function removeRegistryPeople(db: Db, env = process.env): Promise<string> {
  if (isProductionEnv(env)) return "skipped (production)";
  const { names } = readJson<{ names: string[] }>("removed-registry-people.json");
  let people = 0;
  let sigs = 0;
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(users).where(and(inArray(users.name, names), isNull(users.removedAt)));
    for (const u of rows) {
      const now = new Date();
      await tx
        .update(users)
        .set({ active: false, pendingConfirmation: false, email: `removed.${u.id}@invalid.ogserc.local`, removedAt: now, updatedAt: now })
        .where(eq(users.id, u.id));
      for (const t of [userRoles, sessions, accounts, notifications, formDrafts] as const) await tx.delete(t).where(eq(t.userId, u.id));
      await writeAudit(tx, {
        actor: SEED,
        action: "User deleted",
        module: "admin",
        entityType: "user",
        entityId: u.id,
        detail: `${u.name} <${u.email}>: Registry staff, removed with the Registry (Phase 9; development and preview only).`,
      });
      people += 1;
    }
    const off = await tx
      .update(signatories)
      .set({ active: false, updatedAt: new Date() })
      .where(and(inArray(signatories.name, names), eq(signatories.confirmed, false), eq(signatories.active, true)))
      .returning({ id: signatories.id, name: signatories.name });
    for (const g of off) {
      await writeAudit(tx, { actor: SEED, action: "Signatory changed", module: "admin", entityType: "signatory", entityId: g.id, detail: `${g.name}: switched off (Registry staff, removed with the Registry; Phase 9)` });
    }
    sigs = off.length;
  });
  return `${people} account(s) marked deleted, ${sigs} signatory row(s) switched off`;
}

export async function seedBootstrapAdmin(db: Db, env = process.env): Promise<string | null> {
  const [admin] = await db
    .select({ id: users.id })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "admin"), eq(users.active, true)))
    .limit(1);
  if (admin) return null;
  const name = env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  if (!name || !email) {
    console.warn("No active admin, and BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_EMAIL are not set: no admin created.");
    return null;
  }
  const res = await createUserAs(db, SEED, {
    name,
    email,
    roles: ["admin"],
    password: env.BOOTSTRAP_ADMIN_PASSWORD || undefined,
    notes: "First admin, created by the seed",
  });
  return res.tempPassword ?? "(from BOOTSTRAP_ADMIN_PASSWORD)";
}

async function main() {
  const url = directDatabaseUrl();
  if (!url) throw new Error(missingDatabaseMessage());
  const db = createDb(url, 2);
  try {
    await db.execute(sql`select 1`);
    console.log(`Holidays added: ${await seedHolidays(db)}`);
    const ref = await seedReference(db, SEED);
    console.log(`Reference data added: ${Object.entries(ref).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    console.log(`Registry staff: ${await removeRegistryPeople(db)}`);
    const pw = await seedBootstrapAdmin(db);
    if (pw) console.log(`First admin created. One-time password (shown once): ${pw}`);
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
