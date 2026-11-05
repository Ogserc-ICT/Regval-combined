import "server-only";
import { createDb, type Db } from "./connect";

const globalForDb = globalThis as unknown as { __ogsercDb?: Db };

/**
 * The app's database handle (pooled connection, DATABASE_URL). One pool per
 * server instance; reused across hot reloads in development.
 */
export const db: Db =
  globalForDb.__ogsercDb ??
  (globalForDb.__ogsercDb = createDb(process.env.DATABASE_URL ?? ""));
