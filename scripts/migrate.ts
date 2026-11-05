/**
 * pnpm db:migrate — applies migrations over the direct (unpooled) connection.
 * Runs as a Vercel build step; never on a cold start.
 */
import { config } from "dotenv";
import { directDatabaseUrl, missingDatabaseMessage } from "../src/server/db/env";
import { runMigrations } from "../src/server/db/migrate";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = directDatabaseUrl();
if (!url) {
  console.error(missingDatabaseMessage());
  process.exit(1);
}
runMigrations(url)
  .then(() => console.log("Migrations applied."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
