/**
 * pnpm db:migrate — applies migrations over the direct (unpooled) connection.
 * Runs as a Vercel build step; never on a cold start.
 */
import { config } from "dotenv";
import { runMigrations } from "../src/server/db/migrate";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set");
  process.exit(1);
}
runMigrations(url)
  .then(() => console.log("Migrations applied."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
