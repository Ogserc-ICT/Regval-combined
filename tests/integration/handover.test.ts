/**
 * Phase 11a: payment handover to the Revenue Registry. Checks the guarantees of
 * docs/REVENUE-REGISTRY-CONTRACT.md §3 and §6 and the file format of §4.
 */
import { eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handoverChecksum, PAYMENT_COLUMNS } from "../../src/domain/handover";
import { counters, handoverBatches, listItems, payments } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { clearData, deletePayment, deleteSubmission } from "../../src/server/services/data-admin";
import { batchCsv, batchXlsx, handoverWaiting, listBatches, markImported, prepareHandover } from "../../src/server/services/handover";
import { createOwnUse } from "../../src/server/services/ownuse";
import { confirmPayment, recordPayment, rejectPayment, reversePayment } from "../../src/server/services/payments";
import { createSubmission } from "../../src/server/services/submissions/save";
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

let n = 0;
const filing = () => ({
  filingType: "NEW",
  formFiled: "REG-01D",
  registeredName: `Handover Test ${++n} Ltd`,
  dateSubmitted: "2026-11-04",
  timeReceived: "10:00",
  submissionChannel: "By hand",
  principalLga: "Sagamu",
  primaryActivity: "GEN",
  installedCapacityMw: 5,
  licenceStatus: "OGSERC licence/permit",
  licences: [{ licenceNo: `HL/${n}`, expiryDate: "2030-01-01" }],
  operatingOnEffectiveDate: "Y",
});

async function setup() {
  const registration = await makeActor(db, ["registration"]);
  const finance = await makeActor(db, ["finance"]);
  const admin = await makeActor(db, ["admin"]);
  const s = await createSubmission(db, registration, filing());
  const idOf = async (payNo: string) => (await db.select({ id: payments.id }).from(payments).where(eq(payments.payNo, payNo)))[0].id;
  const pay = async (amount: number, purpose = "Registration fee", reference = s.ackNo) => {
    const no = await recordPayment(db, registration, { dateReceived: "2026-11-04", reference, amount, purpose, channel: "Remita", rrr: `0${amount}` });
    return { no, id: await idOf(no) };
  };
  return { registration, finance, admin, s, pay };
}

describe("handover batches", () => {
  it("hands over each confirmed payment once, leaves out pending, rejected and early-reversed ones, and carries later reversals", async () => {
    const { registration, finance, s, pay } = await setup();
    const a = await pay(5_000_000);
    const b = await pay(250_000, "Late registration charge");
    const pending = await pay(100);
    const rejected = await pay(200);
    const early = await pay(300);
    for (const p of [a, b, early]) await confirmPayment(db, finance, p.id, { verifiedWithBank: true });
    await rejectPayment(db, finance, rejected.id, "No such transfer");
    await reversePayment(db, finance, early.id, "Duplicate");
    void pending;

    expect((await failure(prepareHandover(db, registration))).status).toBe(403);
    expect(await handoverWaiting(db)).toMatchObject({ paymentLines: 2, reversalLines: 0, netTotal: 5_250_000 });

    const one = await prepareHandover(db, finance);
    expect(one.batchNo).toMatch(/^OGSERC\/EXP\/2026\/\d{4}$/);
    const serial = (no: string) => Number(no.split("/").pop());
    expect(one.lines.map((l) => l.lineId)).toEqual([`${a.no}:P`, `${b.no}:P`].sort());
    expect(one).toMatchObject({ paymentLines: 2, reversalLines: 0, paymentTotal: 5_250_000, reversalTotal: 0, netTotal: 5_250_000, checksum: handoverChecksum(one.lines) });
    const line = one.lines.find((l) => l.payNo === a.no)!;
    expect(line).toMatchObject({ lineType: "Payment", batchNo: one.batchNo, amountKobo: 5_000_000, payer: expect.stringContaining("Handover Test"), paidFor: "Registration", filingType: "New registration", ackNo: s.ackNo, lga: "Sagamu", confirmedBy: finance.name, recordedBy: registration.name, verifiedWithBank: "Y", rrr: "05000000", reversedOn: "" });
    expect(line.category).toMatch(/^[A-K]$/);

    expect((await failure(prepareHandover(db, finance))).reasons[0]).toContain("Nothing to hand over");

    await reversePayment(db, finance, a.id, "Bank recalled the transfer");
    const two = await prepareHandover(db, finance);
    expect(serial(two.batchNo)).toBe(serial(one.batchNo) + 1);
    expect(two.lines).toHaveLength(1);
    expect(two.lines[0]).toMatchObject({ lineId: `${a.no}:R`, lineType: "Reversal", amountKobo: -5_000_000, reversalReason: "Bank recalled the transfer", reversedBy: finance.name });
    expect(two).toMatchObject({ paymentLines: 0, reversalLines: 1, reversalTotal: -5_000_000, netTotal: -5_000_000, confirmedFrom: null });
    expect((await failure(prepareHandover(db, finance))).kind).toBe("blocked");
  });

  it("never puts a line in two batches when two people prepare at once", async () => {
    const { finance, admin, pay } = await setup();
    for (const amt of [1000, 2000, 3000]) await confirmPayment(db, finance, (await pay(amt)).id, { verifiedWithBank: true });
    const results = await Promise.allSettled([prepareHandover(db, finance), prepareHandover(db, admin)]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect((ok[0] as PromiseFulfilledResult<{ lines: unknown[] }>).value.lines).toHaveLength(3);
    expect((await listBatches(db)).length).toBe(1);
  });

  it("writes the file the contract describes, the same on every download", async () => {
    const { finance, pay } = await setup();
    await db.update(listItems).set({ meta: "4020101" }).where(sql`${listItems.listKey} = 'payment_purpose' and ${listItems.value} = 'Registration fee'`);
    await confirmPayment(db, finance, (await pay(1_234_567)).id, { verifiedWithBank: true });
    const b = await prepareHandover(db, finance);
    expect(b.lines[0].revenueCode).toBe("4020101");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await batchXlsx(b)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Payments")!;
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(PAYMENT_COLUMNS.map((c) => c.header));
    const row = ws.getRow(2);
    const cell = (h: string) => row.getCell(PAYMENT_COLUMNS.findIndex((c) => c.header === h) + 1).value;
    expect(cell("Amount (kobo)")).toBe(1_234_567);
    expect(cell("Amount (NGN)")).toBe(12_345.67);
    expect(cell("RRR")).toBe("01234567");
    expect(typeof cell("Date received")).toBe("string");
    const fields = new Map<string, unknown>();
    wb.getWorksheet("Batch")!.eachRow((r, i) => {
      if (i > 1) fields.set(String(r.getCell(1).value), r.getCell(2).value);
    });
    expect(fields.get("Format version")).toBe(1);
    expect(fields.get("Batch no.")).toBe(b.batchNo);
    expect(fields.get("Net total (kobo)")).toBe(1_234_567);
    expect(fields.get("Checksum (SHA-256)")).toBe(handoverChecksum(b.lines));
    expect(String(fields.get("Prepared at"))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+01:00$/);

    const [again] = await db.select().from(handoverBatches).where(eq(handoverBatches.id, b.id));
    expect(batchCsv(again)).toBe(batchCsv(b));
    expect(batchCsv(b).split("\r\n")[0]).toBe(`﻿${PAYMENT_COLUMNS.map((c) => c.header).join(",")}`);
  });

  it("includes own-use payments with their own details", async () => {
    const { registration, finance } = await setup();
    const o = await createOwnUse(db, registration, { name: "Factory Ltd", dateFiled: "2026-11-04", timeReceived: "11:00", submissionChannel: "By hand", lga: "Ifo", units: [{ kw: 300 }] });
    const no = await recordPayment(db, registration, { dateReceived: "2026-11-04", reference: o.ounNo!, amount: 50_000 });
    const [{ id }] = await db.select({ id: payments.id }).from(payments).where(eq(payments.payNo, no));
    await confirmPayment(db, finance, id, { verifiedWithBank: true });
    const b = await prepareHandover(db, finance);
    expect(b.lines[0]).toMatchObject({ paidFor: "Own-use notification", filingType: "Own-use notification", payer: "Factory Ltd", lga: "Ifo", category: "I", verifiedWithBank: "Y" });
  });

  it("marks a batch imported once, and keeps batches from being changed or deleted", async () => {
    const { finance, registration, pay } = await setup();
    await confirmPayment(db, finance, (await pay(1000)).id, { verifiedWithBank: true });
    const b = await prepareHandover(db, finance);
    expect((await failure(markImported(db, registration, b.id, ""))).status).toBe(403);
    expect((await failure(markImported(db, finance, b.id, "2999-01-01"))).fieldErrors.importedOn).toBeDefined();
    await markImported(db, finance, b.id, "");
    expect((await failure(markImported(db, finance, b.id, ""))).reasons[0]).toContain("already marked imported");
    expect(await dbErrorMessage(db.execute(sql`update handover_batches set net_total = 1`))).toContain("locked");
    expect(await dbErrorMessage(db.execute(sql`delete from handover_lines`))).toContain("cannot be deleted");
  });

  it("keeps handed-over payments out of the admin delete tools until the batches go with them", async () => {
    const { finance, admin, s, pay } = await setup();
    const p = await pay(1000);
    await confirmPayment(db, finance, p.id, { verifiedWithBank: true });
    const b = await prepareHandover(db, finance);
    await reversePayment(db, finance, p.id, "Wrong");
    expect((await failure(deletePayment(db, admin, p.id))).reasons[0]).toContain(`handed over to the Revenue Registry in ${b.batchNo}`);
    expect((await failure(deleteSubmission(db, admin, s.id, s.ackNo))).reasons.join(" ")).toContain("handed over");
    expect((await failure(clearData(db, admin, ["register", "ownUse"], "correct horse battery"))).reasons[0]).toContain("tick Payment handover batches too");
    expect((await failure(clearData(db, admin, ["handover", "register"], "correct horse battery"))).reasons[0]).toContain("only together");
    const r = await clearData(db, admin, ["handover", "register", "ownUse"], "correct horse battery");
    expect(r.cleared.handover).toBe(1);
    expect(r.restarted).toContain("EXP");
    expect(await db.select().from(counters).where(eq(counters.series, "EXP"))).toHaveLength(0);
  });
});
