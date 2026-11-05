/**
 * Creates a Drizzle client over node-postgres. Kept free of "server-only"
 * so scripts (migrate, seed) and integration tests can use it.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema> & { $client: Pool };
/** A transaction handle (or the db itself) that services write through. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(url: string, max = 10): Db {
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max, idleTimeoutMillis: 10_000 });
  return drizzle(pool, { schema }) as Db;
}
