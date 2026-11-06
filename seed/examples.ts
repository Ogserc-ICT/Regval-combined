/**
 * EXAMPLE rows ([G4]): development and preview only, never production (the
 * caller checks examplesAllowed()). They are the workbook's own EXAMPLE rows
 * (3 inward, 2 outward, 2 files, 2 file movements; SPEC §29), loaded with the
 * same importer as the real record and flagged is_example. Idempotent.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "../src/server/db/connect";
import { importWorkbook } from "../src/server/services/import";

export const WORKBOOK = path.join("docs", "source", "OGSERC_Registry_and_Evaluation_Combined.xlsm");

export async function seedExamples(db: Db): Promise<string> {
  const file = path.join(process.cwd(), WORKBOOK);
  if (!existsSync(file)) return `skipped: ${WORKBOOK} not found`;
  const r = await importWorkbook(db, null, { buffer: readFileSync(file), sourceName: path.basename(file), mode: "examples", dryRun: false }, { system: true });
  return Object.entries(r.sheets)
    .map(([name, s]) => `${name} ${s.imported} new${s.alreadyThere ? `, ${s.alreadyThere} already there` : ""}`)
    .join("; ");
}
