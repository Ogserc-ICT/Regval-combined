/**
 * Deleting a staff account: gone from use, kept as a name on the record.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { accounts, auditLog, frontDeskItems, sessions, userRoles, users } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { logFrontDesk } from "../../src/server/services/registry/frontdesk";
import { createSubmission } from "../../src/server/services/submissions/save";
import { assignOfficers } from "../../src/server/services/submissions/workflow";
import { createUserAs, getActorById, removeUser, resetPassword, updateUser } from "../../src/server/services/users";
import { lagosToday } from "../../src/server/time";
import { makeActor, resetTables, testDb } from "./helpers";

const db = testDb(10);
afterAll(() => db.$client.end());
beforeEach(() => resetTables(db));

async function failure(p: Promise<unknown>): Promise<ServiceError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return e;
    throw e;
  }
  throw new Error("expected a ServiceError");
}

describe("delete staff", () => {
  it("signs them out, strips roles and sign-in, frees the email, keeps their name on records, and audits", async () => {
    const admin = await makeActor(db, ["admin"]);
    const fd = await makeActor(db, ["front_desk"], "Ade Front");
    const [before] = await db.select({ email: users.email }).from(users).where(eq(users.id, fd.id));
    await db.insert(sessions).values({ userId: fd.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) });
    const item = await logFrontDesk(db, fd, { receivedDate: lagosToday(), receivedTime: "00:01", sender: "Walk-in", subject: "Letter" });

    expect(await removeUser(db, admin, fd.id)).toBe("Ade Front");

    const [u] = await db.select().from(users).where(eq(users.id, fd.id));
    expect(u).toMatchObject({ active: false, name: "Ade Front", removedBy: admin.id });
    expect(u.removedAt).toBeTruthy();
    expect(await db.select().from(userRoles).where(eq(userRoles.userId, fd.id))).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, fd.id))).toEqual([]);
    expect(await db.select().from(accounts).where(eq(accounts.userId, fd.id))).toEqual([]);
    expect((await getActorById(db, fd.id))?.active).toBe(false);

    // Their record still points at them, by name.
    const [row] = await db.select().from(frontDeskItems).where(eq(frontDeskItems.id, item.id));
    expect(row.receivedByName).toBe("Ade Front");

    // The email can be used again.
    const again = await createUserAs(db, { id: admin.id, name: admin.name }, { name: "Ade Front", email: before.email, roles: ["front_desk"], password: "correct horse battery" });
    expect(again.id).not.toBe(fd.id);

    const [log] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, fd.id), eq(auditLog.action, "User deleted")));
    expect(log.detail).toContain(before.email);

    // Deleted accounts cannot be changed, reset or deleted again.
    expect((await failure(updateUser(db, admin, fd.id, { active: true }))).reasons[0]).toMatch(/deleted/);
    expect((await failure(resetPassword(db, admin, fd.id))).reasons[0]).toMatch(/deleted/);
    expect((await failure(removeUser(db, admin, fd.id))).reasons[0]).toMatch(/already deleted/);
  });

  it("admins only; never yourself; never the last admin", async () => {
    const admin = await makeActor(db, ["admin"]);
    const registry = await makeActor(db, ["registry"]);
    expect((await failure(removeUser(db, registry, admin.id))).status).toBe(403);
    expect((await failure(removeUser(db, admin, admin.id))).reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/your own account/), expect.stringMatching(/at least one active admin/)]),
    );
    const admin2 = await makeActor(db, ["admin"]);
    await removeUser(db, admin2, admin.id);
    expect((await failure(removeUser(db, admin2, admin2.id))).reasons[0]).toMatch(/your own account/);
  });

  it("refused while they are assigned to an open evaluation, naming it", async () => {
    const [admin, registry, evaluator, supervisor, approver] = await Promise.all([
      makeActor(db, ["admin"]),
      makeActor(db, ["registry"]),
      makeActor(db, ["evaluator"]),
      makeActor(db, ["supervisor"]),
      makeActor(db, ["approver"]),
    ]);
    const s = await createSubmission(db, registry, {
      filingType: "NEW",
      formFiled: "REG-01D",
      registeredName: "Removal Power Ltd",
      dateSubmitted: "2026-11-04",
      principalLga: "Sagamu",
      primaryActivity: "GEN",
      installedCapacityMw: 5,
      licenceStatus: "OGSERC licence/permit",
      licences: [{ licenceNo: "RM/1", expiryDate: "2030-01-01" }],
      operatingOnEffectiveDate: "Y",
    });
    await assignOfficers(db, supervisor, s.id, { evaluatingOfficerId: evaluator.id, reviewingSupervisorId: supervisor.id, approvingOfficerId: approver.id });
    const e = await failure(removeUser(db, admin, evaluator.id));
    expect(e.reasons).toEqual([`Assign another evaluating officer for ${s.ackNo} first.`]);

    await assignOfficers(db, supervisor, s.id, { evaluatingOfficerId: null });
    await removeUser(db, admin, evaluator.id);
  });
});
