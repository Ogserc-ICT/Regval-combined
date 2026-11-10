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
          col("Status"), col("Date received", "date"), col("Received at"), col("Channel"), col("Deemed receipt", "date"), col("Deadline", "date"), col("Days late", "number"), col("Registration fee (NGN)", "money"),
          col("Late charge (NGN)", "money"), col("Waiver (NGN)", "money"), col("Total due (NGN)", "money"), col("Paid (NGN)", "money"), col("With Finance (NGN)", "money"),
          col("Balance (NGN)", "money"), col("Payment status"), col("Registration no. in use", "text"), col("Determination due", "date"), col("SLA"), col("Evaluation"),
          col("Flags"), col("Next action"), col("Deficiency notice sent", "date"), col("Show-cause letter sent", "date"), col("Certificate issued", "date"),
          col("Certificate sent", "date"), col("Saved by"), col("EXAMPLE"),
        ],
        rows: list.map(({ row: r, deemed, a }) => [
          r.ackNo, FILING_LABELS[r.filingType], r.formFiled, r.linkedRegistrationNo, r.registeredName, r.cacNo, r.tin, r.phone, r.email, r.principalLga, r.primaryActivity,
          r.installedCapacityMw, r.licenceStatus, a.categoryApplied, r.status, r.dateSubmitted, lagosStamp(r.receivedAt), r.submissionChannel, deemed, a.deadline, a.daysLate, naira(a.registrationFee), naira(a.lateCharge),
          naira(r.approvedWaiver), naira(a.totalDue), naira(a.payments.amountPaid), naira(a.payments.withFinance), naira(a.balance), a.paymentStatus, a.registrationNoInUse,
          a.determinationDue, a.sla || null, a.evaluationStatus, a.flags.map((f) => f.text).join("; ") || null, a.nextAction, r.deficiencyNoticeDate, r.showCauseDate, r.certificateIssueDate,
          r.certificateSentOn, r.createdByName, yn(r.isExample),
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
          col("OUN no.", "text"), col("ACK no.", "text"), col("Name"), col("Date received", "date"), col("Received at"), col("Channel"), col("Deemed receipt", "date"), col("CAC no.", "text"), col("Site address"), col("LGA"), col("Phone", "text"),
          col("Units"), col("Installed (kW)", "number"), col("Eligibility"), col("Fee due (NGN)", "money"), col("Paid (NGN)", "money"), col("Balance (NGN)", "money"),
          col("Payment status"), col("Registration no.", "text"), col("Flags"), col("EXAMPLE"),
        ],
        rows: list.map(({ row: r, units, a }) => [
          r.ounNo, r.ackNo, r.name, r.dateFiled, lagosStamp(r.receivedAt), r.submissionChannel, r.deemedReceiptDate, r.cacNo, r.siteAddress, r.lga, r.phone, units.length, a.installedKw, a.eligibility, naira(a.feeDue), naira(a.payments.amountPaid),
          naira(a.balance), a.paymentStatus, r.registrationNo, a.flags.map((f) => f.text).join("; ") || null, yn(r.isExample),
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
  wb.creator = "OGSERC Registration & Evaluation";
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
