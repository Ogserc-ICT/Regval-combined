/**
 * EXAMPLE rows ([G4]): development and preview only, never production (the
 * caller checks examplesAllowed()). The workbook's EXAMPLE rows are all in the
 * Registry sheets (Inward, Outward, File Index, File Movement); they are
 * seeded in Phase 3 with the registry tables.
 */
import type { Db } from "../src/server/db/connect";

export async function seedExamples(_db: Db): Promise<string> {
  void _db;
  return "none yet (the workbook's EXAMPLE rows are registry rows, seeded in Phase 3)";
}
