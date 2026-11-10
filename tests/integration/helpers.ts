import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "../../src/server/db/connect";
import type { Actor } from "../../src/server/auth/actor";
import { createUserAs } from "../../src/server/services/users";
import type { Role } from "../../src/domain/roles";

config({ path: ".env.local" });
config();

export function testDb(max = 25): Db {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  return createDb(url, max);
}

/** Clears record tables between tests. The audit log cannot be cleared (it is append-only). */
export async function resetTables(db: Db) {
  // TRUNCATE skips the row-level no-delete guards; the audit log is never truncated.
  await db.execute(sql`truncate users, settings, holidays, signatories, daily_review_runs restart identity cascade`);
}

/** Drizzle wraps driver errors; resolve to the database's own message. */
export async function dbErrorMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return err.cause?.message ?? err.message ?? String(e);
  }
  throw new Error("expected the statement to fail");
}

let n = 0;
export async function makeActor(db: Db, roles: Role[], name?: string): Promise<Actor> {
  n += 1;
  const display = name ?? `Test ${roles.join("+") || "user"} ${n}`;
  const email = `t${Date.now()}.${n}@example.test`;
  const { id } = await createUserAs(db, { id: null, name: "Test" }, { name: display, email, roles, password: "correct horse battery" });
  return { id, name: display, email, roles, active: true, mustChangePassword: false };
}
