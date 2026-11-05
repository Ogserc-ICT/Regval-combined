import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { verifyAuditChain, writeAudit } from "../../src/server/audit";
import { dbErrorMessage, testDb } from "./helpers";

const db = testDb(15);
afterAll(() => db.$client.end());

describe("audit log (SPEC §28)", () => {
  it("is written in the transaction and rolled back with it", async () => {
    const marker = `rollback-${Date.now()}`;
    await expect(
      db.transaction(async (tx) => {
        await writeAudit(tx, { actor: { id: null, name: "Test" }, action: "Test", module: "system", reference: marker });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    const res = await db.execute(sql`select count(*)::int as n from audit_log where reference = ${marker}`);
    expect(res.rows[0]).toEqual({ n: 0 });
  });

  it("concurrent writes keep one unbroken hash chain", async () => {
    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        db.transaction((tx) =>
          writeAudit(tx, { actor: { id: null, name: "Test" }, action: "Parallel", module: "system", detail: `#${i}`, data: { i, nested: { b: 2, a: 1 } } }),
        ),
      ),
    );
    const check = await verifyAuditChain(db);
    expect(check.ok).toBe(true);
  });

  it("rejects UPDATE, DELETE and TRUNCATE", async () => {
    await db.transaction((tx) => writeAudit(tx, { actor: { id: null, name: "Test" }, action: "Keep", module: "system" }));
    expect(await dbErrorMessage(db.execute(sql`update audit_log set detail = 'x'`))).toMatch(/append-only/);
    expect(await dbErrorMessage(db.execute(sql`delete from audit_log`))).toMatch(/append-only/);
    expect(await dbErrorMessage(db.execute(sql`truncate audit_log`))).toMatch(/append-only/);
  });

  it("detects an edit made by someone who bypasses the triggers", async () => {
    const { seq } = await db.transaction((tx) =>
      writeAudit(tx, { actor: { id: null, name: "Test" }, action: "Original", module: "system", detail: "before" }),
    );
    // Only a database owner can do this; the check must still catch it.
    await db.execute(sql`alter table audit_log disable trigger audit_log_no_update_delete`);
    try {
      await db.execute(sql`update audit_log set detail = 'tampered' where seq = ${seq}`);
    } finally {
      await db.execute(sql`alter table audit_log enable trigger audit_log_no_update_delete`);
    }
    const check = await verifyAuditChain(db);
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.brokenAtSeq).toBe(seq);
    // Put it back so later tests see a clean chain.
    await db.execute(sql`alter table audit_log disable trigger audit_log_no_update_delete`);
    try {
      await db.execute(sql`update audit_log set detail = 'before' where seq = ${seq}`);
    } finally {
      await db.execute(sql`alter table audit_log enable trigger audit_log_no_update_delete`);
    }
    expect((await verifyAuditChain(db)).ok).toBe(true);
  });
});
