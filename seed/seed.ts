/**
 * Idempotent seed (docs/PLAN.md §9). Safe to run on every deploy:
 *  - reference data: holidays (inserted only if missing; admin edits are kept)
 *  - people from the workbook: inactive, awaiting confirmation (Q22)
 *  - the first admin, from BOOTSTRAP_ADMIN_* when no active admin exists
 *  - EXAMPLE rows: development and preview only ([G4]); none exist yet in Phase 1
 *
 * Usage: pnpm db:seed
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { createDb, type Db } from "../src/server/db/connect";
import { holidays, userRoles, users } from "../src/server/db/schema";
import { writeAudit, type AuditActor } from "../src/server/audit";
import { createUserAs } from "../src/server/services/users";
import { examplesAllowed } from "../src/server/seed-guard";

config({ path: ".env.local" });
config();

const SEED: AuditActor = { id: null, name: "Seed" };

type HolidayRow = { date: string; name: string; status: "Fixed" | "Provisional" | "Estimated" | "State-declared"; note?: string };
type Person = { name: string; roles: string[]; notes?: string };

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "seed", "data", file), "utf8")) as T;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
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

export async function seedPeople(db: Db): Promise<number> {
  const { people } = readJson<{ people: Person[] }>("people.json");
  let added = 0;
  for (const p of people) {
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.name, p.name));
    if (exists) continue;
    await createUserAs(db, SEED, {
      name: p.name,
      email: `pending.${slug(p.name)}@invalid.ogserc.local`,
      roles: p.roles,
      active: false,
      pendingConfirmation: true,
      notes: `${p.notes ?? ""} · Seeded from the workbook: add the work email, confirm and activate.`.trim(),
    });
    added += 1;
  }
  return added;
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
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url, 2);
  try {
    await db.execute(sql`select 1`);
    console.log(`Holidays added: ${await seedHolidays(db)}`);
    console.log(`People added (inactive, awaiting confirmation): ${await seedPeople(db)}`);
    const pw = await seedBootstrapAdmin(db);
    if (pw) console.log(`First admin created. One-time password (shown once): ${pw}`);
    const ex = examplesAllowed();
    console.log(ex.allowed ? `EXAMPLE rows: allowed (${ex.reason}); none to seed in Phase 1.` : `EXAMPLE rows: not seeded (${ex.reason}).`);
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
