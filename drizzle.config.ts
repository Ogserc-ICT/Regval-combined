import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { directDatabaseUrl } from "./src/server/db/env";

config({ path: ".env.local" });
config();

// Migrations always use the direct (unpooled) connection.
const url = process.env.MIGRATE_DATABASE_URL ?? directDatabaseUrl();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./src/server/db/migrations",
  dbCredentials: { url: url ?? "" },
  strict: true,
  verbose: true,
});
