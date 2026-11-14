/**
 * Payment handover to the Revenue Registry (Phase 11a; docs/REVENUE-REGISTRY-CONTRACT.md).
 * Finance prepares numbered batches of every confirmed payment not yet handed over, plus a
 * reversal line for every handed-over payment reversed since. A batch is frozen when prepared;
 * each line is in exactly one batch; numbers are never reused.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { lagosDate, yearOf } from "@/domain/dates";
import { batchFields, byLineId, lagosIso, lineId, PAYMENT_COLUMNS, summarise, type HandoverLine, type HandoverLineType } from "@/domain/handover";
import { FILING_LABELS } from "@/domain/registration/types";

import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import type { Db, DbOrTx, Tx } from "../db/connect";
import { handoverBatches, handoverLines, listItems, ownUseNotifications, payments, submissions } from "../db/schema";
import { blocked, notFound, Problems } from "../errors";
import { issueNumber } from "../numbering";
import { lagosToday, serverNow } from "../time";
import { assessMany } from "./submissions/load";

export type HandoverBatch = typeof handoverBatches.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

/** Payments due a line now: confirmed and not handed over; handed over and since reversed. */
async function candidates(db: DbOrTx): Promise<{ p: PaymentRow; type: HandoverLineType }[]> {
  const sent = (type: HandoverLineType) =>
    sql`exists (select 1 from ${handoverLines} h where h.payment_id = ${payments.id} and h.line_type = ${type})`;
  const [due, reversed] = await Promise.all([
    db
      .select()
      .from(payments)
      .where(and(eq(payments.financeStatus, "Confirmed"), eq(payments.reversed, false), sql`not ${sent("Payment")}`)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.financeStatus, "Confirmed"), eq(payments.reversed, true), sent("Payment"), sql`not ${sent("Reversal")}`)),
  ]);
  return [...due.map((p) => ({ p, type: "Payment" as const })), ...reversed.map((p) => ({ p, type: "Reversal" as const }))];
}

/** The lines as they would be handed over now (contract §4.1), in Line ID order. */
async function buildLines(db: DbOrTx, batchNo: string, due: { p: PaymentRow; type: HandoverLineType }[]): Promise<HandoverLine[]> {
  if (!due.length) return [];
  const subIds = [...new Set(due.filter((d) => d.p.ownerType === "submission").map((d) => d.p.ownerId))];
  const ouIds = [...new Set(due.filter((d) => d.p.ownerType === "own_use").map((d) => d.p.ownerId))];
  const [subRows, ouRows, codes] = await Promise.all([
    subIds.length ? db.select().from(submissions).where(inArray(submissions.id, subIds)) : Promise.resolve([]),
    ouIds.length ? db.select().from(ownUseNotifications).where(inArray(ownUseNotifications.id, ouIds)) : Promise.resolve([]),
    db.select({ value: listItems.value, meta: listItems.meta }).from(listItems).where(eq(listItems.listKey, "payment_purpose")),
  ]);
  const assessed = new Map((await assessMany(db, subRows)).map((l) => [l.row.id, l]));
  const ou = new Map(ouRows.map((o) => [o.id, o]));
  const code = new Map(codes.map((c) => [c.value, c.meta ?? ""]));

  return due
    .map(({ p, type }): HandoverLine => {
      const sign = type === "Reversal" ? -1 : 1;
      let owner: Pick<HandoverLine, "payer" | "paidFor" | "filingType" | "ackNo" | "registrationNoOrOun" | "category" | "lga">;
      if (p.ownerType === "submission") {
        const l = assessed.get(p.ownerId);
        owner = {
          payer: l?.row.registeredName ?? "",
          paidFor: "Registration",
          filingType: l ? FILING_LABELS[l.row.filingType] : "",
          ackNo: l?.row.ackNo ?? p.reference,
          registrationNoOrOun: l?.row.registrationNo ?? "",
          category: l?.row.confirmedCategory || l?.a.categoryApplied || "",
          lga: l?.row.principalLga ?? "",
        };
      } else {
        const o = ou.get(p.ownerId);
        owner = {
          payer: o?.name ?? "",
          paidFor: "Own-use notification",
          filingType: "Own-use notification",
          ackNo: o?.ackNo ?? p.reference,
          registrationNoOrOun: o?.ounNo ?? "",
          category: "I",
          lga: o?.lga ?? "",
        };
      }
      return {
        lineId: lineId(p.payNo, type),
        lineType: type,
        payNo: p.payNo,
        batchNo,
        dateReceived: p.dateReceived,
        dateConfirmed: p.decidedAt ? lagosDate(p.decidedAt) : "",
        amountKobo: sign * p.amount,
        purpose: p.purpose ?? "",
        revenueCode: p.purpose ? (code.get(p.purpose) ?? "") : "",
        channel: p.channel ?? "",
        rrr: p.rrr ?? "",
        ...owner,
        recordedBy: p.recordedByName,
        confirmedBy: p.decidedByName ?? "",
        verifiedWithBank: p.verifiedWithBank ? "Y" : "N",
        reversedOn: type === "Reversal" && p.reversedAt ? lagosDate(p.reversedAt) : "",
        reversedBy: type === "Reversal" ? (p.reversedByName ?? "") : "",
        reversalReason: type === "Reversal" ? (p.reversalReason ?? "") : "",
      };
    })
    .sort(byLineId);
}

/** What a batch prepared now would hold (shown before Finance prepares it). */
export async function handoverWaiting(db: DbOrTx) {
  const due = await candidates(db);
  const pay = due.filter((d) => d.type === "Payment");
  const rev = due.filter((d) => d.type === "Reversal");
  return {
    paymentLines: pay.length,
    reversalLines: rev.length,
    paymentTotal: pay.reduce((s, d) => s + d.p.amount, 0),
    reversalTotal: -rev.reduce((s, d) => s + d.p.amount, 0),
    netTotal: pay.reduce((s, d) => s + d.p.amount, 0) - rev.reduce((s, d) => s + d.p.amount, 0),
  };
}

/** Prepare the next batch. One at a time: a second Prepare waits for the first, then finds nothing left. */
export async function prepareHandover(db: Db, actor: Actor | null): Promise<HandoverBatch> {
  authorize(actor, "payments:handover");
  return db.transaction(async (tx: Tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ogserc.handover'))`);
    const due = await candidates(tx);
    if (!due.length) throw blocked("Nothing to hand over: every confirmed payment and reversal is already in a batch.");
    const now = serverNow();
    const { number: batchNo } = await issueNumber(tx, "EXP", { year: yearOf(lagosToday()) });
    const lines = await buildLines(tx, batchNo, due);
    const s = summarise(lines);
    const [batch] = await tx
      .insert(handoverBatches)
      .values({ batchNo, preparedAt: now, preparedBy: actor.id, preparedByName: actor.name, ...s, lines })
      .returning();
    const byId = new Map(due.map((d) => [lineId(d.p.payNo, d.type), d.p.id]));
    await tx.insert(handoverLines).values(lines.map((l) => ({ lineId: l.lineId, paymentId: byId.get(l.lineId)!, lineType: l.lineType, batchId: batch.id })));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Handover prepared",
      module: "registration",
      entityType: "handover",
      entityId: batch.id,
      reference: batchNo,
      detail: `${s.paymentLines} payment(s), ${s.reversalLines} reversal(s); net ${(s.netTotal / 100).toFixed(2)} NGN; checksum ${s.checksum}`,
    });
    return batch;
  });
}

export async function listBatches(db: DbOrTx, limit = 200) {
  return db
    .select({
      id: handoverBatches.id,
      batchNo: handoverBatches.batchNo,
      preparedAt: handoverBatches.preparedAt,
      preparedByName: handoverBatches.preparedByName,
      paymentLines: handoverBatches.paymentLines,
      reversalLines: handoverBatches.reversalLines,
      netTotal: handoverBatches.netTotal,
      confirmedFrom: handoverBatches.confirmedFrom,
      confirmedTo: handoverBatches.confirmedTo,
      importedOn: handoverBatches.importedOn,
      importedByName: handoverBatches.importedByName,
    })
    .from(handoverBatches)
    .orderBy(desc(handoverBatches.preparedAt))
    .limit(limit);
}

export async function batchesNotImported(db: DbOrTx): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(handoverBatches).where(isNull(handoverBatches.importedOn));
  return r?.n ?? 0;
}

/** The batch a PAY number was handed over in, per line type (shown on payments). */
export async function handoverOf(db: DbOrTx, paymentIds: string[]): Promise<Map<string, { batchNo: string; lineType: HandoverLineType }[]>> {
  const out = new Map<string, { batchNo: string; lineType: HandoverLineType }[]>();
  if (!paymentIds.length) return out;
  const rows = await db
    .select({ paymentId: handoverLines.paymentId, lineType: handoverLines.lineType, batchNo: handoverBatches.batchNo })
    .from(handoverLines)
    .innerJoin(handoverBatches, eq(handoverBatches.id, handoverLines.batchId))
    .where(inArray(handoverLines.paymentId, paymentIds));
  for (const r of rows) out.set(r.paymentId, [...(out.get(r.paymentId) ?? []), { batchNo: r.batchNo, lineType: r.lineType }]);
  return out;
}

export async function getBatch(db: DbOrTx, actor: Actor | null, batchNo: string): Promise<HandoverBatch> {
  authorize(actor, "payments:handover");
  const [b] = await db.select().from(handoverBatches).where(eq(handoverBatches.batchNo, batchNo));
  if (!b) throw notFound("Handover batch");
  return b;
}

/** Finance records that the Revenue Registry has imported the batch. Once only. */
export async function markImported(db: Db, actor: Actor | null, batchId: string, importedOn: string): Promise<string> {
  authorize(actor, "payments:handover");
  return db.transaction(async (tx) => {
    if (!/^[0-9a-f-]{36}$/i.test(batchId)) throw notFound("Handover batch");
    const [b] = await tx.select().from(handoverBatches).where(eq(handoverBatches.id, batchId)).for("update");
    if (!b) throw notFound("Handover batch");
    if (b.importedOn) throw blocked(`${b.batchNo} is already marked imported (${b.importedOn}, ${b.importedByName}).`);
    const p = new Problems();
    const today = lagosToday();
    const day = importedOn.trim() || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) p.field("importedOn", "Enter the date as YYYY-MM-DD.");
    else if (day > today) p.field("importedOn", "The import date cannot be in the future.");
    else if (day < lagosDate(b.preparedAt)) p.field("importedOn", "The import date cannot be before the batch was prepared.");
    p.throwIfAny();
    await tx
      .update(handoverBatches)
      .set({ importedOn: day, importedBy: actor.id, importedByName: actor.name, importedAt: serverNow() })
      .where(eq(handoverBatches.id, batchId));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Handover marked imported",
      module: "registration",
      entityType: "handover",
      entityId: b.id,
      reference: b.batchNo,
      detail: `Imported into the Revenue Registry on ${day}`,
    });
    return `${b.batchNo} marked imported.`;
  });
}

// ------------------------------------------------------------------ the file (contract §4)

const summaryOf = (b: HandoverBatch) => ({
  batchNo: b.batchNo,
  preparedAt: lagosIso(b.preparedAt),
  preparedBy: b.preparedByName,
  confirmedFrom: b.confirmedFrom ?? "",
  confirmedTo: b.confirmedTo ?? "",
  paymentLines: b.paymentLines,
  reversalLines: b.reversalLines,
  paymentTotal: b.paymentTotal,
  reversalTotal: b.reversalTotal,
  netTotal: b.netTotal,
  checksum: b.checksum,
});

export async function batchXlsx(b: HandoverBatch): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OGSERC Registration & Evaluation";
  wb.created = b.preparedAt;
  wb.modified = b.preparedAt;
  const ws = wb.addWorksheet("Payments", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = PAYMENT_COLUMNS.map((c) => ({
    header: c.header,
    width: Math.min(40, Math.max(12, c.header.length + 2)),
    style: c.kind === "text" ? { numFmt: "@" } : c.kind === "money" ? { numFmt: "#,##0.00" } : { numFmt: "0" },
  }));
  ws.getRow(1).font = { bold: true };
  for (const l of b.lines) ws.addRow(PAYMENT_COLUMNS.map((c) => (c.kind === "text" ? String(c.value(l)) : c.value(l))));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: PAYMENT_COLUMNS.length } };
  const bs = wb.addWorksheet("Batch");
  bs.columns = [
    { header: "Field", width: 24, style: { numFmt: "@" } },
    { header: "Value", width: 70 },
  ];
  bs.getRow(1).font = { bold: true };
  for (const [k, v] of batchFields(summaryOf(b))) {
    const row = bs.addRow([k, v]);
    if (typeof v === "string") row.getCell(2).numFmt = "@";
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function batchCsv(b: HandoverBatch): string {
  const rows = [PAYMENT_COLUMNS.map((c) => csvCell(c.header)).join(","), ...b.lines.map((l) => PAYMENT_COLUMNS.map((c) => csvCell(c.kind === "money" ? (c.value(l) as number).toFixed(2) : c.value(l))).join(","))];
  return `﻿${rows.join("\r\n")}\r\n`;
}

/** Audits a download (the file itself never changes). */
export async function recordDownload(db: Db, actor: Actor, b: HandoverBatch, format: "xlsx" | "csv") {
  await db.transaction((tx) =>
    writeAudit(tx, {
      actor: auditActor(actor),
      action: "Handover downloaded",
      module: "registration",
      entityType: "handover",
      entityId: b.id,
      reference: b.batchNo,
      detail: `${format.toUpperCase()}; ${b.paymentLines + b.reversalLines} line(s); checksum ${b.checksum}`,
    }),
  );
}
