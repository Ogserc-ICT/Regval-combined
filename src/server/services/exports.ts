/**
 * Register exports (docs/PLAN.md §1 "Exports", §7 Admin): every register as
 * CSV or .xlsx, with its calculated columns, generated on request. Replaces
 * the workbook's "Back up workbook now". Phones, CAC numbers, TINs and
 * references stay text; money is in naira; dates are Lagos dates.
 */
import { asc, desc, isNotNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import { lagosDate, lagosMinuteOfDay } from "@/domain/dates";
import { FILING_LABELS } from "@/domain/registration/types";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import type { Db, DbOrTx } from "../db/connect";
import { auditLog, ownUseNotifications, payments, submissions } from "../db/schema";
import { ServiceError } from "../errors";
import { lagosToday } from "../time";
import { loadOwnUse } from "./ownuse";
import { listFiles, listFrontDesk, listInward, listMovements, listOutward, registryCtx } from "./registry/load";
import { assessMany } from "./submissions/load";

type Cell = string | number | null;
/** kind "text" keeps leading zeros (phones, CAC, references); "money" is naira with 2 decimals. */
type Column = { header: string; kind?: "text" | "money" | "number" | "date" };
type Sheet = { columns: Column[]; rows: Cell[][] };

const naira = (kobo: number | null | undefined): Cell => (kobo === null || kobo === undefined ? null : kobo / 100);
const yn = (b: boolean | null | undefined): Cell => (b === true ? "Y" : b === false ? "N" : null);
export const lagosStamp = (d: Date | null | undefined): Cell => {
  if (!d) return null;
  const m = lagosMinuteOfDay(d);
  return `${lagosDate(d)} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const col = (header: string, kind?: Column["kind"]): Column => ({ header, kind });

export const REGISTERS = {
  register: "Register (submissions)",
  payments: "Payments",
  "own-use": "Own-use notifications",
  inward: "Inward Register",
  outward: "Outward Register",
  "front-desk": "Front Desk Log",
  files: "File Index",
  movements: "File movements",
  audit: "Audit log",
} as const;
export type RegisterKey = keyof typeof REGISTERS;
export const isRegisterKey = (k: string): k is RegisterKey => k in REGISTERS;

async function build(db: DbOrTx, key: RegisterKey): Promise<Sheet> {
  switch (key) {
    case "register": {
      const rows = await db.select().from(submissions).where(isNotNull(submissions.status)).orderBy(asc(submissions.ackNo));
      const list = await assessMany(db, rows);
      return {
        columns: [
          col("ACK no.", "text"), col("Filing type"), col("Form"), col("Linked registration no.", "text"), col("Registered name"), col("CAC no.", "text"), col("TIN", "text"),
          col("Phone", "text"), col("Email"), col("Principal LGA"), col("Primary activity"), col("Capacity (MW)", "number"), col("Licence status"), col("Category applied"),
          col("Status"), col("Date submitted", "date"), col("Deemed receipt", "date"), col("Deadline", "date"), col("Days late", "number"), col("Registration fee (NGN)", "money"),
          col("Late charge (NGN)", "money"), col("Waiver (NGN)", "money"), col("Total due (NGN)", "money"), col("Paid (NGN)", "money"), col("With Finance (NGN)", "money"),
          col("Balance (NGN)", "money"), col("Payment status"), col("Registration no. in use", "text"), col("Determination due", "date"), col("SLA"), col("Evaluation"),
          col("Flags"), col("Next action"), col("Saved by"), col("EXAMPLE"),
        ],
        rows: list.map(({ row: r, deemed, a }) => [
          r.ackNo, FILING_LABELS[r.filingType], r.formFiled, r.linkedRegistrationNo, r.registeredName, r.cacNo, r.tin, r.phone, r.email, r.principalLga, r.primaryActivity,
          r.installedCapacityMw, r.licenceStatus, a.categoryApplied, r.status, r.dateSubmitted, deemed, a.deadline, a.daysLate, naira(a.registrationFee), naira(a.lateCharge),
          naira(r.approvedWaiver), naira(a.totalDue), naira(a.payments.amountPaid), naira(a.payments.withFinance), naira(a.balance), a.paymentStatus, a.registrationNoInUse,
          a.determinationDue, a.sla || null, a.evaluationStatus, a.flags.map((f) => f.text).join("; ") || null, a.nextAction, r.createdByName, yn(r.isExample),
        ]),
      };
    }
    case "payments": {
      const rows = await db.select().from(payments).orderBy(asc(payments.payNo));
      return {
        columns: [
          col("PAY no.", "text"), col("Date received", "date"), col("For (ACK / OUN)", "text"), col("Purpose"), col("Channel"), col("Amount (NGN)", "money"), col("RRR / bank ref", "text"),
          col("Recorded by"), col("Recorded at"), col("Finance status"), col("Verified with bank"), col("Decided by"), col("Decided at"), col("Finance remarks"), col("Reversed"),
          col("Reversed by"), col("Reversal reason"), col("EXAMPLE"),
        ],
        rows: rows.map((p) => [
          p.payNo, p.dateReceived, p.reference, p.purpose, p.channel, naira(p.amount), p.rrr, p.recordedByName, lagosStamp(p.recordedAt), p.financeStatus, yn(p.verifiedWithBank),
          p.decidedByName, lagosStamp(p.decidedAt), p.financeRemarks, yn(p.reversed), p.reversedByName, p.reversalReason, yn(p.isExample),
        ]),
      };
    }
    case "own-use": {
      const ids = await db.select({ id: ownUseNotifications.id }).from(ownUseNotifications).where(isNotNull(ownUseNotifications.ounNo)).orderBy(asc(ownUseNotifications.ounNo));
      const list = [];
      for (const { id } of ids) list.push(await loadOwnUse(db, id));
      return {
        columns: [
          col("OUN no.", "text"), col("ACK no.", "text"), col("Name"), col("Date filed", "date"), col("CAC no.", "text"), col("Site address"), col("LGA"), col("Phone", "text"),
          col("Units"), col("Installed (kW)", "number"), col("Eligibility"), col("Fee due (NGN)", "money"), col("Paid (NGN)", "money"), col("Balance (NGN)", "money"),
          col("Payment status"), col("Registration no.", "text"), col("Flags"), col("EXAMPLE"),
        ],
        rows: list.map(({ row: r, units, a }) => [
          r.ounNo, r.ackNo, r.name, r.dateFiled, r.cacNo, r.siteAddress, r.lga, r.phone, units.length, a.installedKw, a.eligibility, naira(a.feeDue), naira(a.payments.amountPaid),
          naira(a.balance), a.paymentStatus, r.registrationNo, a.flags.map((f) => f.text).join("; ") || null, yn(r.isExample),
        ]),
      };
    }
    case "inward": {
      const ctx = await registryCtx(db);
      const list = (await listInward(db, ctx)).reverse();
      return {
        columns: [
          col("ACK no.", "text"), col("Received"), col("Mode"), col("Deemed receipt", "date"), col("Type"), col("Sender"), col("Sender category"), col("Subject"), col("Sender's ref", "text"),
          col("Date on document", "date"), col("Related OGSERC no.", "text"), col("In response to (OUT)", "text"), col("CAC / reg no.", "text"), col("LGA"), col("Contact"),
          col("Phone", "text"), col("Email"), col("Received by"), col("Ack. via"), col("Unit"), col("Division"), col("Action"), col("Priority"), col("Action officer"),
          col("File", "text"), col("Routed"), col("Forwarded", "date"), col("Response due", "date"), col("Reply (OUT)", "text"), col("Closed", "date"), col("Status"),
          col("Working days open", "number"), col("After deadline (REG-01)"), col("Register entry"), col("FD no.", "text"), col("Source"), col("Flags"), col("EXAMPLE"),
        ],
        rows: list.map((v) => [
          v.row.ackNo, lagosStamp(v.row.receivedAt), v.row.mode, v.row.deemedReceiptDate, v.typeName, v.row.sender, v.row.senderCategory, v.row.subject, v.row.senderRef,
          v.row.documentDate, v.row.relatedOgsercNo, v.inResponseToOutNo, v.row.cacNo, v.row.lga, v.row.contactPerson, v.row.phone, v.row.email, v.receivedByName,
          v.row.ackIssuedVia, v.unit?.name ?? null, v.unit?.divisionName ?? null, v.row.actionRequired, v.row.priority, v.row.actionOfficer, v.fileRef, lagosStamp(v.row.routedAt),
          v.row.forwardedOn, v.a.responseDue, v.reply?.outNo ?? null, v.a.closedOn, v.a.status, v.a.workingDaysOpen,
          v.a.filedAfterDeadline === null ? null : yn(v.a.filedAfterDeadline), v.entry === "Not a filing" ? null : v.entry, v.fdNo, v.row.source, v.a.flags.join("; ") || null,
          yn(v.row.isExample),
        ]),
      };
    }
    case "outward": {
      const list = (await listOutward(db)).reverse();
      return {
        columns: [
          col("OUT no.", "text"), col("Date of document", "date"), col("Type"), col("Subject"), col("Addressee"), col("Recipient category"), col("Address / email"),
          col("In reply to (ACK)", "text"), col("Related OGSERC no.", "text"), col("File", "text"), col("Originating unit"), col("Prepared by"), col("Signed by"),
          col("Dispatch mode"), col("Dispatched", "date"), col("Dispatched by"), col("Tracking ref", "text"), col("Delivered", "date"), col("Response due", "date"),
          col("Response (ACK)", "text"), col("Status"), col("Flags"), col("EXAMPLE"),
        ],
        rows: list.map((v) => [
          v.row.outNo, v.row.documentDate, v.row.documentType, v.row.subject, v.row.addressee, v.row.recipientCategory, v.row.recipientContact, v.inReplyToAck,
          v.row.relatedOgsercNo, v.fileRef, v.unitName, v.row.preparedBy, v.row.signatoryName, v.row.dispatchMode, v.row.dispatchedOn, v.dispatchedByName, v.row.trackingRef,
          v.row.deliveredOn, v.a.responseDue, v.response?.ackNo ?? null, v.a.status, v.a.flags.join("; ") || null, yn(v.row.isExample),
        ]),
      };
    }
    case "front-desk": {
      const list = (await listFrontDesk(db)).reverse();
      return {
        columns: [
          col("FD no.", "text"), col("Received"), col("Sender"), col("Subject"), col("Type"), col("Mode"), col("Delivered by"), col("Phone", "text"), col("Volumes", "number"),
          col("Received by"), col("Registered as (ACK)", "text"), col("Registered at"), col("Status"), col("Remarks"), col("EXAMPLE"),
        ],
        rows: list.map((x) => [
          x.row.fdNo, lagosStamp(x.row.receivedAt), x.row.sender, x.row.subject, x.typeName, x.row.mode, x.row.deliveredBy, x.row.phone, x.row.volumes, x.row.receivedByName,
          x.ackNo, lagosStamp(x.row.registeredAt), x.status, x.row.remarks, yn(x.row.isExample),
        ]),
      };
    }
    case "files": {
      const list = await listFiles(db);
      return {
        columns: [
          col("File reference", "text"), col("Title"), col("Class"), col("Owning unit"), col("Opened", "date"), col("Volume", "number"), col("Security"), col("Status"),
          col("Closed", "date"), col("Currently with"), col("Out since", "date"), col("Return due", "date"), col("Inward items", "number"), col("Outward items", "number"),
          col("Last correspondence", "date"), col("Flags"), col("EXAMPLE"),
        ],
        rows: list.map((f) => [
          f.row.fileRef, f.row.title, f.row.fileClass, f.owningUnit, f.row.openedOn, f.row.currentVolume, f.row.security, f.row.status, f.row.closedOn, f.a.currentlyWith,
          f.a.outSince, f.a.returnDue, f.inwardCount, f.outwardCount, f.a.lastCorrespondence, f.a.flags.join("; ") || null, yn(f.row.isExample),
        ]),
      };
    }
    case "movements": {
      const list = (await listMovements(db)).reverse();
      return {
        columns: [
          col("File reference", "text"), col("Title"), col("Out"), col("Volume", "number"), col("Issued to"), col("Unit"), col("Purpose"), col("Released by"),
          col("Return due", "date"), col("Returned"), col("Received back by"), col("Status"),
        ],
        rows: list.map((m) => [
          m.fileRef, m.fileTitle, lagosStamp(m.row.outAt), m.row.volume, m.row.issuedTo, m.unitName, m.row.purpose, m.row.releasedByName, m.returnDue,
          lagosStamp(m.row.returnedAt), m.row.receivedBackByName, m.status,
        ]),
      };
    }
    case "audit": {
      const rows = await db.select().from(auditLog).orderBy(desc(auditLog.seq));
      return {
        columns: [col("Seq", "number"), col("When (Lagos)"), col("User"), col("Action"), col("Module"), col("Reference", "text"), col("Detail")],
        rows: rows.map((r) => [r.seq, lagosStamp(r.at), r.userName, r.action, r.module, r.reference, r.detail]),
      };
    }
  }
}

/** CSV cells: quote when needed; stop spreadsheet formula injection. */
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && (/^[=@\t\r]/.test(s) || /^[+-][^0-9]/.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(sheet: Sheet): string {
  const lines = [sheet.columns.map((c) => csvCell(c.header)).join(","), ...sheet.rows.map((r) => r.map(csvCell).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function toXlsx(sheet: Sheet, title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OGSERC Registry & Evaluation";
  wb.created = new Date();
  const ws = wb.addWorksheet(title.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = sheet.columns.map((c) => ({
    header: c.header,
    width: Math.min(48, Math.max(10, c.header.length + 2)),
    style: c.kind === "text" ? { numFmt: "@" } : c.kind === "money" ? { numFmt: "#,##0.00" } : {},
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of sheet.rows) ws.addRow(r.map((v, i) => (sheet.columns[i].kind === "text" && v !== null ? String(v) : v)));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Builds one register export and audits it (admin only). */
export async function exportRegister(db: Db, actor: Actor | null, key: string, format: "csv" | "xlsx"): Promise<{ filename: string; contentType: string; body: Buffer | string }> {
  authorize(actor, "registers:export");
  if (!isRegisterKey(key)) throw new ServiceError("not_found", [`No register called ${key}.`]);
  const sheet = await build(db, key);
  const stem = `OGSERC-${REGISTERS[key].replace(/[^A-Za-z0-9]+/g, "-").replace(/-+$/, "")}-${lagosToday()}`;
  await db.transaction((tx) =>
    writeAudit(tx, { actor: auditActor(actor), action: "Register exported", module: "admin", detail: `${REGISTERS[key]}: ${sheet.rows.length} row(s) as ${format.toUpperCase()}` }),
  );
  if (format === "csv") return { filename: `${stem}.csv`, contentType: "text/csv; charset=utf-8", body: toCsv(sheet) };
  return { filename: `${stem}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: await toXlsx(sheet, REGISTERS[key]) };
}

export { build as buildRegisterSheet };
