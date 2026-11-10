import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { issueNumber } from "../../src/server/numbering";
import { dbErrorMessage, testDb } from "./helpers";

const db = testDb(30);
afterAll(() => db.$client.end());

describe("numbering service [G12]", () => {
  it("acceptance: 20 parallel saves get 20 consecutive ACK numbers, no duplicates", async () => {
    const year = 2031;
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.transaction(async (tx) => {
          const n = await issueNumber(tx, "ACK", { year });
          // Simulate the rest of a save holding the transaction open.
          await tx.execute(sql`select pg_sleep(0.01)`);
          return n;
        }),
      ),
    );
    const serials = results.map((r) => r.serial).sort((a, b) => a - b);
    expect(serials).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(results.map((r) => r.number)).size).toBe(20);
    expect(results.map((r) => r.number)).toContain("OGSERC/ACK/2031/00020");
  });

  it("a rolled-back save does not consume a number; a committed one is never reissued", async () => {
    const year = 2032;
    await db.transaction(async (tx) => {
      await issueNumber(tx, "ACK", { year });
    });
    await expect(
      db.transaction(async (tx) => {
        await issueNumber(tx, "ACK", { year });
        throw new Error("save failed");
      }),
    ).rejects.toThrow("save failed");
    const next = await db.transaction((tx) => issueNumber(tx, "ACK", { year }));
    expect(next.number).toBe("OGSERC/ACK/2032/00002");
  });

  it("series restart each year and are independent", async () => {
    const a = await db.transaction((tx) => issueNumber(tx, "DEF", { year: 2033 }));
    const b = await db.transaction((tx) => issueNumber(tx, "DEF", { year: 2034 }));
    const c = await db.transaction((tx) => issueNumber(tx, "PAY", { year: 2033 }));
    expect([a.number, b.number, c.number]).toEqual(["OGSERC/DEF/2033/00001", "OGSERC/DEF/2034/00001", "OGSERC/PAY/2033/00001"]);
  });

  it("REG shares one serial per year across categories", async () => {
    const a = await db.transaction((tx) => issueNumber(tx, "REG", { year: 2035, scope: "D-GEN" }));
    const b = await db.transaction((tx) => issueNumber(tx, "REG", { year: 2035, scope: "I-CPT" }));
    expect([a.number, b.number]).toEqual(["OGSERC/REG/2035/D-GEN/0001", "OGSERC/REG/2035/I-CPT/0002"]);
  });

  it("ACK numbers use the admin's prefix and keep counting when it changes (Q25)", async () => {
    await db.execute(sql`insert into settings (key, value) values ('ackPrefix', '"OGSERC/REG-ACK"'::jsonb) on conflict (key) do update set value = excluded.value`);
    try {
      const a = await db.transaction((tx) => issueNumber(tx, "ACK", { year: 2036 }));
      await db.execute(sql`delete from settings where key = 'ackPrefix'`);
      const b = await db.transaction((tx) => issueNumber(tx, "ACK", { year: 2036 }));
      expect([a.number, b.number]).toEqual(["OGSERC/REG-ACK/2036/00001", "OGSERC/ACK/2036/00002"]);
    } finally {
      await db.execute(sql`delete from settings where key = 'ackPrefix'`);
    }
  });

  it("counters cannot go backwards or be deleted", async () => {
    expect(await dbErrorMessage(db.execute(sql`update counters set last_value = 0 where series = 'ACK' and year = 2031`))).toMatch(/backwards/);
    expect(await dbErrorMessage(db.execute(sql`delete from counters where series = 'ACK'`))).toMatch(/cannot be deleted/);
  });
});
