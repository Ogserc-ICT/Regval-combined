import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { authorize } from "../../src/server/auth/actor";
import { auditLog } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { getHolidaySet, saveHoliday } from "../../src/server/services/holidays";
import { getSettings, updateSettings } from "../../src/server/services/settings";
import { createUser, getActorById, updateUser } from "../../src/server/services/users";
import { makeActor, resetTables, testDb } from "./helpers";
import { seedBootstrapAdmin, seedHolidays, seedPeople } from "../../seed/seed";

const db = testDb(5);
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

describe("roles enforced on the server [G6]–[G8]", () => {
  it("a user without the Router role gets 403 on routing", async () => {
    const registry = await makeActor(db, ["registry"]);
    const router = await makeActor(db, ["router"]);
    expect(() => authorize(registry, "inward:route")).toThrow(ServiceError);
    try {
      authorize(registry, "inward:route");
    } catch (e) {
      expect((e as ServiceError).status).toBe(403);
      expect((e as ServiceError).reasons[0]).toContain("Router");
    }
    expect(() => authorize(router, "inward:route")).not.toThrow();
  });

  it("an inactive account is refused even with the role", async () => {
    const admin = await makeActor(db, ["admin"]);
    expect(() => authorize({ ...admin, active: false }, "settings:write")).toThrow(/not active/);
  });

  it("roles come from the database", async () => {
    const a = await makeActor(db, ["finance", "registry"]);
    const loaded = await getActorById(db, a.id);
    expect(loaded?.roles.sort()).toEqual(["finance", "registry"]);
  });
});

describe("settings [G1]", () => {
  it("only an admin can change settings (403)", async () => {
    const viewer = await makeActor(db, ["viewer"]);
    const e = await failure(updateSettings(db, viewer, { extensionDays: 10 }));
    expect(e.status).toBe(403);
  });

  it("lists every invalid value at once (422)", async () => {
    const admin = await makeActor(db, ["admin"]);
    const e = await failure(updateSettings(db, admin, { effectiveDate: "22/10/2026", extensionDays: -1, ackEmailMode: "Loud" }));
    expect(e.status).toBe(422);
    expect(Object.keys(e.fieldErrors).sort()).toEqual(["ackEmailMode", "effectiveDate", "extensionDays"]);
  });

  it("changing the Effective Date is audited and moves the one deadline", async () => {
    const admin = await makeActor(db, ["admin"]);
    const changes = await updateSettings(db, admin, { effectiveDate: "2026-11-02" });
    expect(changes).toHaveLength(1);
    expect((await getSettings(db)).effectiveDate).toBe("2026-11-02");
    const [last, prev] = await db.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(2);
    expect(last.action).toBe("Registration deadline moved");
    expect(last.detail).toBe("Registration deadline: 2026-12-21 → 2027-01-01");
    expect(prev.action).toBe("Setting changed");
    expect(prev.userName).toBe(admin.name);
    // Unchanged values write nothing.
    expect(await updateSettings(db, admin, { effectiveDate: "2026-11-02" })).toEqual([]);
  });
});

describe("holidays [G13]", () => {
  it("admin-editable with a status, audited; others get 403", async () => {
    const admin = await makeActor(db, ["admin"]);
    const registry = await makeActor(db, ["registry"]);
    await saveHoliday(db, admin, { date: "2027-06-12", name: "Democracy Day", status: "State-declared" });
    expect((await getHolidaySet(db)).has("2027-06-12")).toBe(true);
    expect((await failure(saveHoliday(db, registry, { date: "2027-06-13", name: "X", status: "Fixed" }))).status).toBe(403);
    expect((await failure(saveHoliday(db, admin, { date: "2027-13-01", name: "", status: "Maybe" }))).status).toBe(422);
  });
});

describe("users and seed", () => {
  it("keeps at least one active admin", async () => {
    const admin = await makeActor(db, ["admin"]);
    const e = await failure(updateUser(db, admin, admin.id, { roles: ["viewer"] }));
    expect(e.reasons[0]).toMatch(/at least one active admin/);
    const other = await makeActor(db, ["admin"]);
    await updateUser(db, other, admin.id, { roles: ["viewer"] });
    expect((await getActorById(db, admin.id))?.roles).toEqual(["viewer"]);
  });

  it("only admins create accounts; duplicate emails are refused", async () => {
    const admin = await makeActor(db, ["admin"]);
    const finance = await makeActor(db, ["finance"]);
    expect((await failure(createUser(db, finance, { name: "X", email: "x@ogserc.org.ng", roles: [] }))).status).toBe(403);
    const created = await createUser(db, admin, { name: "New Officer", email: "new@ogserc.org.ng", roles: ["evaluator"] });
    expect(created.tempPassword).toMatch(/^\w{4}-\w{4}-\w{4}-\w{4}$/);
    expect((await failure(createUser(db, admin, { name: "Y", email: "NEW@ogserc.org.ng", roles: [] }))).fieldErrors.email).toBeDefined();
  });

  it("seed is idempotent: people inactive and awaiting confirmation, first admin from env", async () => {
    await seedPeople(db);
    expect(await seedPeople(db)).toBe(0);
    await seedHolidays(db);
    const pw = await seedBootstrapAdmin(db, { BOOTSTRAP_ADMIN_NAME: "Bootstrap Admin", BOOTSTRAP_ADMIN_EMAIL: "admin@ogserc.org.ng" } as unknown as NodeJS.ProcessEnv);
    expect(pw).toBeTruthy();
    expect(await seedBootstrapAdmin(db, { BOOTSTRAP_ADMIN_NAME: "Other", BOOTSTRAP_ADMIN_EMAIL: "o@ogserc.org.ng" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    const { users } = await import("../../src/server/db/schema");
    const [front] = await db.select().from(users).where(eq(users.name, "Funmilayo Sorungbe"));
    expect(front.active).toBe(false);
    expect(front.pendingConfirmation).toBe(true);
  });
});
