import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { auditLog, correspondenceTypes, frontDeskItems, inwardItems, ownUseNotifications, submissions, units } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { createOwnUse, saveDraftOwnUse } from "../../src/server/services/ownuse";
import { createSubmission } from "../../src/server/services/submissions/save";
import { saveSignatory } from "../../src/server/services/signatories";
import { issueFile, openFile, returnFile } from "../../src/server/services/registry/files";
import { logFrontDesk } from "../../src/server/services/registry/frontdesk";
import { registryIntake, type IntakeInput } from "../../src/server/services/registry/intake";
import { closeInward, confirmReceipt, forwardInward, routeInward, saveInward, updateInward, type InwardInput } from "../../src/server/services/registry/inward";
import { listFrontDesk, listInward, loadFile, loadInward, loadOutward, pendingActions, registryCtx } from "../../src/server/services/registry/load";
import { deliverOutward, dispatchOutward, saveOutward } from "../../src/server/services/registry/outward";
import { lagosToday } from "../../src/server/time";
import { dbErrorMessage, makeActor, resetTables, testDb } from "./helpers";

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

const typeId = async (name: string) => (await db.select({ id: correspondenceTypes.id }).from(correspondenceTypes).where(eq(correspondenceTypes.name, name)))[0].id;
const unitId = async (name: string) => (await db.select({ id: units.id }).from(units).where(eq(units.name, name)))[0].id;
const today = () => lagosToday();

const inward = async (over: Partial<InwardInput> = {}): Promise<InwardInput> => ({
  receivedDate: today(),
  receivedTime: "00:05",
  mode: "Hand delivery",
  correspondenceTypeId: await typeId("Tariff application / review"),
  sender: "Ogun Power Ltd",
  senderCategory: "Registrant / licensee",
  subject: "Tariff review",
  ackIssuedVia: "Printed slip",
  ...over,
});

const intake = (over: Partial<IntakeInput> = {}): IntakeInput => ({
  receivedDate: today(),
  receivedTime: "00:05",
  mode: "Hand delivery",
  filingType: "NEW",
  formFiled: "REG-01D",
  registeredName: "Intake Power Ltd",
  cacNo: "RC777001",
  principalLga: "Sagamu",
  ackIssuedVia: "Printed slip",
  ...over,
});

async function people() {
  return {
    frontDesk: await makeActor(db, ["front_desk"]),
    registry: await makeActor(db, ["registry"]),
    router: await makeActor(db, ["router"]),
    admin: await makeActor(db, ["admin"]),
  };
}

describe("front desk (SPEC §17)", () => {
  it("logs with an FD number; registering it once links the ACK; a second time is refused", async () => {
    const p = await people();
    const fd = await logFrontDesk(db, p.frontDesk, { receivedDate: today(), receivedTime: "00:01", sender: "Walk-in", subject: "Letter", phone: "08021846578" });
    expect(fd.fdNo).toMatch(/^OGSERC\/FD\/\d{4}\/\d{5}$/);
    expect((await listFrontDesk(db, { awaitingOnly: true })).map((x) => x.row.fdNo)).toEqual([fd.fdNo]);

    const saved = await saveInward(db, p.registry, await inward({ frontDeskItemId: fd.id, receivedTime: "23:59" }));
    const [row] = await db.select().from(frontDeskItems).where(eq(frontDeskItems.id, fd.id));
    expect(row.inwardItemId).toBe(saved.id);
    // The front-desk time becomes the receipt time
    const [i] = await db.select().from(inwardItems).where(eq(inwardItems.id, saved.id));
    expect(i.receivedAt.getTime()).toBe(row.receivedAt.getTime());
    expect(await listFrontDesk(db, { awaitingOnly: true })).toEqual([]);

    const again = await failure(saveInward(db, p.registry, await inward({ frontDeskItemId: fd.id })));
    expect(again.reasons[0]).toContain("registered once only");
    // The link is locked in the database too
    expect(await dbErrorMessage(db.update(frontDeskItems).set({ inwardItemId: null }).where(eq(frontDeskItems.id, fd.id)))).toContain("locked");
  });

  it("phone keeps its zero; a bad phone is refused", async () => {
    const p = await people();
    const bad = await failure(logFrontDesk(db, p.frontDesk, { receivedDate: today(), receivedTime: "00:01", sender: "A", subject: "B", phone: "8021846578" }));
    expect(bad.fieldErrors.phone[0]).toContain("08021846578");
  });

  it("a viewer cannot log", async () => {
    const viewer = await makeActor(db, ["viewer"]);
    expect((await failure(logFrontDesk(db, viewer, { receivedDate: today(), receivedTime: "00:01", sender: "A", subject: "B" }))).status).toBe(403);
  });
});

describe("one ACK series across New Inward, Registry Intake and direct entries", () => {
  it("interleaved saves take consecutive ACK numbers", async () => {
    const p = await people();
    const registry = await makeActor(db, ["registry"]);
    const a = await saveInward(db, p.registry, await inward());
    const b = await registryIntake(db, registry, intake());
    const c = await createSubmission(db, p.registry, {
      filingType: "NEW",
      formFiled: "REG-01D",
      registeredName: "Direct Ltd",
      dateSubmitted: today(),
      principalLga: "Sagamu",
      primaryActivity: "GEN",
      installedCapacityMw: 5,
      licenceStatus: "OGSERC licence/permit",
      operatingOnEffectiveDate: "Y",
    });
    const d = await createOwnUse(db, p.registry, { name: "Factory", dateFiled: today(), lga: "Sagamu", units: [{ kw: 300 }] });
    const serials = [a.ackNo, b.ackNo, c.ackNo, d.ackNo].map((n) => Number(n.split("/").pop()));
    for (let i = 1; i < serials.length; i++) expect(serials[i]).toBe(serials[0] + i);
  });
});

describe("New Inward (SPEC §19)", () => {
  it("saves, warns when the unit has no email, and logs 'Not emailed: no address'", async () => {
    const p = await people();
    const reg = await saveInward(db, p.registry, await inward({ correspondenceTypeId: await typeId("REG-01 Registration (new)"), subject: "REG-01" }));
    expect(reg.warnings[0]).toContain("no email address");
    const [log] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, reg.id), eq(auditLog.action, "Not emailed: no address")));
    expect(log.detail).toContain("Licensing unit");
    // Tariff and Rates sits in a division that has an address
    const ok = await saveInward(db, p.registry, await inward());
    // Default mode is Preview: the email waits for review instead of a no-address warning
    expect(ok.warnings.join(" ")).toContain("ready for review");
    expect(ok.warnings.join(" ")).not.toContain("no email address");
  });

  it("REG-01 waits for its Register entry, then Registry Intake pulls it without a new ACK", async () => {
    const p = await people();
    const reg = await saveInward(db, p.registry, await inward({ correspondenceTypeId: await typeId("REG-01 Registration (new)"), sender: "Pulled Ltd", subject: "REG-01" }));
    expect((await loadInward(db, reg.id)).entry).toBe("Awaiting Register entry");
    const r = await registryIntake(db, p.registry, intake({ inwardItemId: reg.id, registeredName: "Pulled Ltd", primaryActivity: "GEN", licenceStatus: "Unlicensed", operatingOnEffectiveDate: "Y" }));
    expect(r.ackNo).toBe(reg.ackNo);
    expect(r.entry.saved).toBe(true);
    expect((await loadInward(db, reg.id)).entry).toBe("Saved on Register");
    const again = await failure(registryIntake(db, p.registry, intake({ inwardItemId: reg.id })));
    expect(again.reasons[0]).toContain("already has its Register entry");
  });

  it("refuses an unknown 'In response to our ref'", async () => {
    const p = await people();
    const e = await failure(saveInward(db, p.registry, await inward({ inResponseToOutNo: "OGSERC/OUT/2026/99999" })));
    expect(e.fieldErrors.inResponseToOutNo[0]).toContain("not in the Outward Register");
  });

  it("update item audits old → new", async () => {
    const p = await people();
    const s = await saveInward(db, p.registry, await inward());
    const changed = await updateInward(db, p.registry, s.id, { sender: "Ogun Power Plc", remarks: "Called" });
    expect(changed).toEqual(["Sender", "Remarks"]);
    const [log] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, s.id), eq(auditLog.action, "Edited")));
    expect(log.detail).toContain("Sender: Ogun Power Ltd → Ogun Power Plc");
  });
});

describe("routing, forwarding, confirming and closing (SPEC §20)", () => {
  it("a user without the Router role gets 403 on routing, through the service", async () => {
    const p = await people();
    const s = await saveInward(db, p.registry, await inward());
    const e = await failure(routeInward(db, p.registry, s.id, { actionRequired: "Reply required" }));
    expect(e.status).toBe(403);
    expect(e.reasons[0]).toContain("Router");
  });

  it("route → forward → confirm receipt → close, with statuses", async () => {
    const p = await people();
    const legal = await unitId("Compliance/Legal Services unit: Legal");
    const unitOfficer = { ...(await makeActor(db, ["unit_officer"])), unitId: legal };
    const otherUnit = { ...(await makeActor(db, ["unit_officer"])), unitId: await unitId("Human Resources") };
    const s = await saveInward(db, p.registry, await inward());
    expect((await loadInward(db, s.id)).a.status).toBe("Awaiting routing");

    // Forwarding before routing asks to confirm
    expect((await failure(forwardInward(db, p.registry, s.id, {}))).kind).toBe("confirm");

    const file = await openFile(db, p.registry, { fileClass: "Legal", title: "Tariff matters" });
    const missing = await failure(routeInward(db, p.router, s.id, { actionRequired: "Reply required", fileRef: "OGSERC/LEG/999" }));
    expect(missing.fieldErrors.fileRef[0]).toContain("not in the File Index");
    const routed = await routeInward(db, p.router, s.id, { unitId: legal, actionRequired: "Reply required", priority: "Urgent", fileRef: file.fileRef, actionOfficer: "A. Bello" });
    expect(routed.warnings[0]).toContain("Routing not emailed");
    let v = await loadInward(db, s.id);
    expect(v.a.status).toBe("Awaiting forwarding");
    expect(v.unit?.name).toBe("Compliance/Legal Services unit: Legal");
    expect(v.fileRef).toBe(file.fileRef);

    await forwardInward(db, p.registry, s.id, { unitOfficer: "A. Bello" });
    v = await loadInward(db, s.id);
    expect(v.a.status).toBe("Open");

    expect((await failure(confirmReceipt(db, otherUnit, s.id))).status).toBe(403);
    await confirmReceipt(db, unitOfficer, s.id);
    expect((await loadInward(db, s.id)).row.unitOfficerReceivedBy).toBe(unitOfficer.name);

    const pend = await pendingActions(db, legal);
    expect(pend.items.map((x) => x.row.id)).toContain(s.id);
    expect((await pendingActions(db, await unitId("Human Resources"))).items).toEqual([]);

    expect((await failure(closeInward(db, otherUnit, s.id, { confirm: true }))).status).toBe(403);
    expect((await failure(closeInward(db, unitOfficer, s.id))).kind).toBe("confirm");
    await closeInward(db, unitOfficer, s.id, { confirm: true });
    v = await loadInward(db, s.id);
    expect(v.a.status).toBe("Closed");
    expect(v.a.closedOn).toBe(today());
    expect((await pendingActions(db, legal)).items).toEqual([]);
  });
});

describe("outward (SPEC §21)", () => {
  async function signatory(admin: Awaited<ReturnType<typeof people>>["admin"]) {
    return saveSignatory(db, admin, null, { name: "Secretary Person", designation: "Secretary to the Commission", role: "secretary", active: true, confirmed: true });
  }

  it("issues OUT; a dispatched reply closes the inward item; delivery needs a dispatch", async () => {
    const p = await people();
    const sig = await signatory(p.admin);
    const s = await saveInward(db, p.registry, await inward());
    const out = await saveOutward(db, p.registry, {
      documentDate: today(),
      documentType: "Reply to correspondence",
      subject: "Re: tariff review",
      addressee: "Ogun Power Ltd",
      recipientCategory: "Registrant / licensee",
      inReplyToAck: s.ackNo,
      originatingUnitId: await unitId("Tariff and Rates unit"),
      signatoryId: sig,
      dispatchMode: "Hand delivery",
    });
    expect(out.outNo).toMatch(/^OGSERC\/OUT\/\d{4}\/\d{5}$/);
    expect(out.replyTo).toContain("Ogun Power Ltd");
    expect((await loadOutward(db, out.id)).a.status).toBe("Not yet dispatched");
    expect((await failure(deliverOutward(db, p.registry, out.id))).reasons[0]).toContain("not been dispatched");

    await dispatchOutward(db, p.registry, out.id, { trackingRef: "TRK1" });
    const o = await loadOutward(db, out.id);
    expect(o.a.status).toBe("Dispatched");
    expect(o.dispatchedByName).toBe(p.registry.name);
    const i = await loadInward(db, s.id);
    expect(i.a.status).toBe("Closed");
    expect(i.reply?.outNo).toBe(out.outNo);

    await deliverOutward(db, p.registry, out.id, { receivedBy: "Gateman" });
    expect((await loadOutward(db, out.id)).a.status).toBe("Delivered");
  });

  it("an inward item quoting the OUT number is its response", async () => {
    const p = await people();
    const sig = await signatory(p.admin);
    const out = await saveOutward(db, p.registry, {
      documentDate: today(),
      documentType: "Information request to licensee",
      subject: "Please send returns",
      addressee: "Ogun Power Ltd",
      recipientCategory: "Registrant / licensee",
      originatingUnitId: await unitId("Tariff and Rates unit"),
      signatoryId: sig,
      dispatchMode: "Email",
      dispatchedOn: today(),
    });
    expect((await loadOutward(db, out.id)).a.status).toBe("Awaiting response");
    const resp = await saveInward(db, p.registry, await inward({ inResponseToOutNo: out.outNo, subject: "Returns" }));
    const o = await loadOutward(db, out.id);
    expect(o.a.status).toBe("Response received");
    expect(o.response?.ackNo).toBe(resp.ackNo);
  });

  it("refuses an inactive or missing signatory and an unknown inward ACK", async () => {
    const p = await people();
    const e = await failure(
      saveOutward(db, p.registry, {
        documentDate: today(),
        documentType: "Letter (general)",
        subject: "S",
        addressee: "A",
        recipientCategory: "Other",
        inReplyToAck: "OGSERC/ACK/2026/99999",
        originatingUnitId: await unitId("Administration"),
        signatoryId: "",
        dispatchMode: "Hand delivery",
      }),
    );
    expect(Object.keys(e.fieldErrors).sort()).toEqual(["inReplyToAck", "signatoryId"]);
  });
});

describe("files (SPEC §22)", () => {
  it("generates per-class references, skips typed ones, issues and returns", async () => {
    const p = await people();
    const typed = await openFile(db, p.registry, { fileClass: "Finance", fileRef: "OGSERC/FIN/001", title: "Typed" });
    expect(typed.fileRef).toBe("OGSERC/FIN/001");
    const gen = await openFile(db, p.registry, { fileClass: "Finance", title: "Generated" });
    expect(gen.fileRef).toBe("OGSERC/FIN/002");
    const dup = await failure(openFile(db, p.registry, { fileClass: "Finance", fileRef: "ogserc/fin/002", title: "Dup" }));
    expect(dup.fieldErrors.fileRef[0]).toContain("already in the File Index");

    const hr = await unitId("Human Resources");
    const issued = await issueFile(db, p.registry, { fileId: gen.id, issuedTo: "B. Ade", unitId: hr, purpose: "Review" });
    expect(issued.returnDue > today()).toBe(true);
    let f = await loadFile(db, gen.id);
    expect(f.a.currentlyWith).toBe("B. Ade");
    expect(f.movements[0].status).toBe("Out");
    expect((await failure(issueFile(db, p.registry, { fileId: gen.id, issuedTo: "C", unitId: hr }))).kind).toBe("confirm");

    const back = await returnFile(db, p.registry, gen.id);
    expect(back.from).toBe("B. Ade");
    f = await loadFile(db, gen.id);
    expect(f.a.currentlyWith).toBe("Registry");
    expect(f.movements[0].status).toBe("Returned");
    expect((await failure(returnFile(db, p.registry, gen.id))).reasons[0]).toContain("not out");
  });
});

describe("Registry Intake (SPEC §18)", () => {
  it("from the front desk: ACK, inward, FD link and a saved Register entry in one go", async () => {
    const p = await people();
    const fd = await logFrontDesk(db, p.frontDesk, { receivedDate: today(), receivedTime: "00:02", sender: "Intake Power Ltd", subject: "REG-01D" });
    const r = await registryIntake(
      db,
      p.registry,
      intake({ frontDeskItemId: fd.id, primaryActivity: "GEN", licenceStatus: "OGSERC licence/permit", operatingOnEffectiveDate: "Y", schedule2Count: 12, feeEvidence: true }),
    );
    expect(r.entry).toMatchObject({ kind: "submission", saved: true });
    const [sub] = await db.select().from(submissions).where(eq(submissions.id, r.entry.id));
    expect(sub.ackNo).toBe(r.ackNo);
    expect(sub.status).not.toBeNull();
    expect(sub.remarks).toContain("Registry Intake by");
    const v = (await listInward(db)).find((x) => x.row.id === r.inwardId)!;
    expect(v.fdNo).toBe(fd.fdNo);
    expect(v.row.source).toBe("registry_intake");
    expect(v.entry).toBe("Saved on Register");
    const [log] = await db.select().from(auditLog).where(and(eq(auditLog.reference, r.ackNo), eq(auditLog.action, "Registry acknowledgement")));
    expect(log.detail).toContain(fd.fdNo);
  });

  it("without the activity details the Register row waits as started", async () => {
    const p = await people();
    const r = await registryIntake(db, p.registry, intake());
    expect(r.entry.saved).toBe(false);
    expect(r.warnings.join(" ")).toContain("Register row started");
    const [sub] = await db.select().from(submissions).where(eq(submissions.id, r.entry.id));
    expect(sub.status).toBeNull();
    expect((await loadInward(db, r.inwardId)).entry).toBe("Register row started – complete and save it");
  });

  it("an entry that cannot be saved yet stays started, and the intake still succeeds", async () => {
    const p = await people();
    // Operating N without a planned start date fails the Register save
    const r = await registryIntake(db, p.registry, intake({ primaryActivity: "GEN", licenceStatus: "Unlicensed", operatingOnEffectiveDate: "N" }));
    expect(r.entry.saved).toBe(false);
    expect(r.warnings.join(" ")).toContain("Planned start date");
  });

  it("refuses REG-01I as a form and requires the linked number for updates", async () => {
    const p = await people();
    const e = await failure(registryIntake(db, p.registry, intake({ formFiled: "REG-01I", filingType: "UPDATE" })));
    expect(Object.keys(e.fieldErrors).sort()).toEqual(["formFiled", "linkedRegistrationNo"]);
  });

  it("own-use: starts the row; saving it on Own-use issues the OUN under the same ACK", async () => {
    const p = await people();
    const r = await registryIntake(db, p.registry, intake({ filingType: "OWNUSE", formFiled: null, registeredName: "Factory Ltd" }));
    expect(r.entry.kind).toBe("own_use");
    const [row] = await db.select().from(ownUseNotifications).where(eq(ownUseNotifications.id, r.entry.id));
    expect(row.ounNo).toBeNull();
    const saved = await saveDraftOwnUse(db, p.registry, r.entry.id, { name: "Factory Ltd", dateFiled: today(), lga: "Sagamu", units: [{ kw: 400 }] });
    expect(saved.ackNo).toBe(r.ackNo);
    expect(saved.ounNo).toMatch(/^OGSERC\/OUN\//);
    expect((await loadInward(db, r.inwardId)).entry).toBe("Saved on Own-Use");
  });

  it("only a Registry officer can take in filings", async () => {
    const fdOfficer = await makeActor(db, ["front_desk"]);
    expect((await failure(registryIntake(db, fdOfficer, intake()))).status).toBe(403);
  });
});

describe("registry records are permanent", () => {
  it("cannot be deleted; FD and ACK numbers cannot change", async () => {
    const p = await people();
    const fd = await logFrontDesk(db, p.frontDesk, { receivedDate: today(), receivedTime: "00:01", sender: "A", subject: "B" });
    expect(await dbErrorMessage(db.delete(frontDeskItems).where(eq(frontDeskItems.id, fd.id)))).toContain("cannot be deleted");
    expect(await dbErrorMessage(db.update(frontDeskItems).set({ fdNo: "X" }).where(eq(frontDeskItems.id, fd.id)))).toContain("locked");
  });
});

describe("registry context", () => {
  it("loads reference data with the mode → channel map", async () => {
    const c = await registryCtx(db);
    expect(c.ref.channelForMode("Courier")).toBe("By hand");
    expect(c.ref.channelForMode("Email")).toBe("Email");
    expect(c.ref.fileClasses.find((x) => x.name === "Legal")?.code).toBe("LEG");
    const [last] = await db.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(1);
    expect(last).toBeDefined();
  });
});
