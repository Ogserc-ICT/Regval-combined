/**
 * Applies the SQL migrations in src/server/db/migrations. Used by
 * `pnpm db:migrate` (a Vercel build step, never a cold start) and by the
 * integration tests.
 */
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./connect";

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "src", "server", "db", "migrations");

export async function runMigrations(url: string): Promise<void> {
  const db = createDb(url, 1);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.$client.end();
  }
}
