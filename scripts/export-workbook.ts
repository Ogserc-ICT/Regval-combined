/**
 * pnpm export:workbook [--with-examples] [--out <folder>]
 *
 * Phase 7, the optional offline workbook: a macro-enabled .xlsm mirror of the
 * app's rules and reference data, built from docs/source and the database in
 * DATABASE_URL (run it against production for the real staff and settings).
 * Refuses to build from uncommitted changes ([G10]). --with-examples builds a
 * TRAINING copy that keeps the workbook's EXAMPLE rows ([G4]).
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createDb } from "../src/server/db/connect";
import { directDatabaseUrl, missingDatabaseMessage } from "../src/server/db/env";
import { buildWorkbook, loadExportData } from "./workbook/build";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const TEMPLATE = path.join("docs", "source", "OGSERC_Registry_and_Evaluation_Combined.xlsm");

async function main() {
  const args = process.argv.slice(2);
  const withExamples = args.includes("--with-examples");
  const outIdx = args.indexOf("--out");
  const outDir = outIdx >= 0 ? args[outIdx + 1] : "exports";

  const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
  if (dirty) {
    console.error("Refusing to build: the working tree has uncommitted changes [G10]. Commit them first.\n" + dirty);
    process.exit(1);
  }
  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();

  const url = directDatabaseUrl();
  if (!url) {
    console.error(missingDatabaseMessage());
    process.exit(1);
  }
  const db = createDb(url, 2);
  try {
    const data = await loadExportData(db);
    const { buffer, fileName, report } = await buildWorkbook(readFileSync(TEMPLATE), data, { withExamples, stamp: { commit, builtAt: new Date() } });
    mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, fileName);
    writeFileSync(file, buffer);
    console.log(`Wrote ${file} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)\n`);
    for (const line of report) console.log(`- ${line}`);
  } finally {
    await db.$client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
