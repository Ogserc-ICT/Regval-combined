/**
 * Integration tests run against a real PostgreSQL database (TEST_DATABASE_URL).
 * The schema is dropped and re-migrated once per run.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { runMigrations } from "../../src/server/db/migrate";

export default async function setup() {
  config({ path: ".env.local" });
  config();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to wipe a database whose name does not contain "test": ${new URL(url).pathname}`);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  } finally {
    await client.end();
  }
  await runMigrations(url);
}
