import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { lagosDateTime } from "../../src/domain/dates";
import { fileMovements, files, frontDeskItems, importRuns, inwardItems, outwardItems } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { examplesAllowed } from "../../src/server/seed-guard";
import { goLiveChecks } from "../../src/server/services/go-live";
import { importWorkbook } from "../../src/server/services/import";
import { logFrontDesk } from "../../src/server/services/registry/frontdesk";
import { listInward, loadOutward } from "../../src/server/services/registry/load";
import { makeActor, resetTables, testDb } from "./helpers";

const db = testDb(5);
afterAll(() => db.$client.end());
// The workbook's numbers are fixed (FD/2026/00001 …), so each test starts from empty registers and counters.
beforeEach(async () => {
  await resetTables(db);
  await db.execute(sql`truncate import_runs, counters`);
});

const buffer = readFileSync(path.join(process.cwd(), "docs", "source", "OGSERC_Registry_and_Evaluation_Combined.xlsm"));
const run = (mode: "real" | "examples", dryRun: boolean) => importWorkbook(db, null, { buffer, sourceName: "workbook.xlsm", mode, dryRun }, { system: true });

describe("workbook import: the real record (SPEC §29)", () => {
  it("imports the one real Front Desk item, restores the phone, keeps the placeholder name and moves the FD counter", async () => {
    const r = await run("real", false);
    expect(r.sheets["Front Desk Log"]).toMatchObject({ found: 1, imported: 1, errors: [] });
    for (const s of ["Inward Register", "Outward Register", "File Index", "File Movement"]) expect(r.sheets[s].imported).toBe(0);
    expect(r.sheets["Inward Register"].skippedExample).toBe(3);
    expect(r.notImported).toEqual([]);
    expect(r.notes.join("\n")).toContain("8021846578 restored to 08021846578");
    expect(r.notes.join("\n")).toContain("[Front desk officer 1]");

    const [fd] = await db.select().from(frontDeskItems);
    expect(fd).toMatchObject({ fdNo: "OGSERC/FD/2026/00001", sender: "Verge Power Limited", phone: "08021846578", volumes: 8, mode: "Hand delivery", receivedByName: "[Front desk officer 1]", isExample: false });
    expect(lagosDateTime(fd.receivedAt)).toBe("03-Nov-2026 20:50");

    // The next front-desk number continues after the workbook's.
    const officer = await makeActor(db, ["front_desk"]);
    const next = await logFrontDesk(db, officer, { receivedDate: "2026-11-05", receivedTime: "09:00", sender: "Next", subject: "Next" });
    expect(next.fdNo).toBe("OGSERC/FD/2026/00002");
  });

  it("a dry run reports and keeps nothing; running twice never duplicates", async () => {
    const dry = await run("real", true);
    expect(dry.sheets["Front Desk Log"].imported).toBe(1);
    expect(await db.select().from(frontDeskItems)).toHaveLength(0);
    expect((await db.select().from(importRuns))[0].dryRun).toBe(1);
    await run("real", false);
    const again = await run("real", false);
    expect(again.sheets["Front Desk Log"]).toMatchObject({ imported: 0, alreadyThere: 1 });
    expect(await db.select().from(frontDeskItems)).toHaveLength(1);
  });

  it("a number the app already gave a different item is reported, not overwritten", async () => {
    const officer = await makeActor(db, ["front_desk"]);
    await logFrontDesk(db, officer, { receivedDate: "2026-11-05", receivedTime: "09:00", sender: "Someone else", subject: "x" });
    const r = await run("real", false);
    expect(r.sheets["Front Desk Log"].errors[0]).toContain("already issued this number to a different item");
    const [fd] = await db.select().from(frontDeskItems);
    expect(fd.sender).toBe("Someone else");
  });

  it("only an admin can import through the app", async () => {
    const registry = await makeActor(db, ["registry"]);
    await expect(importWorkbook(db, registry, { buffer, sourceName: "x.xlsm", mode: "real", dryRun: true })).rejects.toBeInstanceOf(ServiceError);
    await expect(importWorkbook(db, await makeActor(db, ["admin"]), { buffer: Buffer.from("not a workbook"), sourceName: "x.xlsm", mode: "real", dryRun: true })).rejects.toThrow(
      "could not be read",
    );
  });
});

describe("workbook import: EXAMPLE rows for development and preview ([G4])", () => {
  it("loads the workbook's EXAMPLE rows, flagged, with their links", async () => {
    const r = await run("examples", false);
    expect(r.sheets["Inward Register"].imported).toBe(3);
    expect(r.sheets["Outward Register"].imported).toBe(2);
    expect(r.sheets["File Index"].imported).toBe(2);
    expect(r.sheets["File Movement"].imported).toBe(2);
    expect(r.sheets["Front Desk Log"].imported).toBe(0);
    for (const t of [inwardItems, outwardItems, files, fileMovements]) {
      const rows = await db.select({ ex: t.isExample }).from(t);
      expect(rows.every((x) => x.ex)).toBe(true);
    }
    // ACK/2026/00001 was replied to by OUT/2026/00001 and is closed by it; ACK 00002 responds to OUT 00001.
    const inward = await listInward(db);
    const a1 = inward.find((x) => x.row.ackNo === "OGSERC/ACK/2026/00001")!;
    expect(a1.reply?.outNo).toBe("OGSERC/OUT/2026/00001");
    expect(a1.fileRef).toBe("OGSERC/RL/001");
    const [o1] = await db.select().from(outwardItems).where(eq(outwardItems.outNo, "OGSERC/OUT/2026/00001"));
    expect((await loadOutward(db, o1.id)).response?.ackNo).toBe("OGSERC/ACK/2026/00002");
    // The email item received 18:40 keeps the workbook's deemed date (next working day).
    expect(inward.find((x) => x.row.ackNo === "OGSERC/ACK/2026/00002")!.row.deemedReceiptDate).toBe("2026-12-01");
  });

  it("acceptance: production has no EXAMPLE records (the seed refuses), previews do", async () => {
    expect(examplesAllowed({ VERCEL_ENV: "production", SEED_EXAMPLES: "true" } as unknown as NodeJS.ProcessEnv).allowed).toBe(false);
    expect(examplesAllowed({ NODE_ENV: "production", SEED_EXAMPLES: "true" } as unknown as NodeJS.ProcessEnv).allowed).toBe(false);
    expect(examplesAllowed({ VERCEL_ENV: "preview", SEED_EXAMPLES: "true" } as unknown as NodeJS.ProcessEnv).allowed).toBe(true);
    await run("examples", false);
    const prod = await goLiveChecks(db, { VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv);
    expect(prod.checks.find((c) => c.label === "No EXAMPLE records")?.state).toBe("fail");
    const preview = await goLiveChecks(db, { VERCEL_ENV: "preview" } as unknown as NodeJS.ProcessEnv);
    expect(preview.checks.find((c) => c.label === "No EXAMPLE records")?.state).toBe("info");
  });
});
