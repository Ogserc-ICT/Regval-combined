/**
 * pnpm import:workbook <file.xlsm> [--commit] [--examples]
 *
 * Imports the workbook's records into the database in DATABASE_URL_UNPOOLED
 * (or DATABASE_URL). A dry run by default: prints the import report and rolls
 * the records back. --commit keeps them. --examples imports the EXAMPLE rows
 * instead of the real ones (refused in production, [G4]).
 * The same import is available to admins under Admin › Import.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createDb } from "../src/server/db/connect";
import { directDatabaseUrl, missingDatabaseMessage } from "../src/server/db/env";
import { examplesAllowed } from "../src/server/seed-guard";
import { formatReport, importWorkbook } from "../src/server/services/import";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: pnpm import:workbook <file.xlsm> [--commit] [--examples]");
    process.exit(2);
  }
  const mode = args.includes("--examples") ? "examples" : "real";
  if (mode === "examples") {
    const ex = examplesAllowed({ ...process.env, SEED_EXAMPLES: "true" });
    if (!ex.allowed) throw new Error(`EXAMPLE rows are refused here (${ex.reason}).`);
  }
  const url = directDatabaseUrl();
  if (!url) {
    console.error(missingDatabaseMessage());
    process.exit(1);
  }
  const db = createDb(url, 2);
  try {
    const report = await importWorkbook(db, null, { buffer: readFileSync(file), sourceName: path.basename(file), mode, dryRun: !args.includes("--commit") }, { system: true });
    console.log(formatReport(report));
  } finally {
    await db.$client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
