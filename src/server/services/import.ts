/**
 * Workbook import (Phase 6; docs/COMBINED_BUILD.md, SPEC §29).
 *
 * Reads the macro-enabled workbook, finds each record sheet's header row and
 * maps columns by their header text, then imports in one transaction:
 * files → front desk → inward → outward → inward "in response to" links →
 * file movements. Numbers keep the value issued in the workbook and the
 * counters move past them, so the app never issues the same number again.
 *
 * mode "real" imports rows with no EXAMPLE marker (production go-live).
 * mode "examples" imports only the EXAMPLE rows, flagged is_example, for
 * development and preview ([G4]). A dry run does everything, writes the
 * report, then rolls the records back.
 *
 * The registration sheets (Register, Payments, Own-Use) are empty in the
 * workbook; any rows found there are listed for entry through the app,
 * where every rule is applied, not imported.
 */
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { deemedReceiptDate } from "@/domain/deemed";
import { isLocalDate, lagosInstant, yearOf, type LocalDate } from "@/domain/dates";
import { validatePhone } from "@/domain/validators";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { SYSTEM_ACTOR, writeAudit, type AuditActor } from "../audit";
import type { Db } from "../db/connect";
import { fileMovements, files, frontDeskItems, importRuns, inwardItems, outwardItems, signatories, users } from "../db/schema";
import { blocked } from "../errors";
import { getHolidaySet } from "./holidays";
import { loadRegistryRef } from "./registry/ref";
import { getSettings } from "./settings";

export type ImportMode = "real" | "examples";

export type SheetReport = { found: number; imported: number; skippedExample: number; skippedReal: number; alreadyThere: number; errors: string[] };
export type ImportReport = {
  source: string;
  sha256: string;
  mode: ImportMode;
  dryRun: boolean;
  sheets: Record<string, SheetReport>;
  notes: string[];
  notImported: string[];
  counters: string[];
};

type Row = { n: number; get: (header: string) => unknown; text: (header: string) => string | null; isExample: boolean; isEmpty: boolean };

// ------------------------------------------------------------------ reading

const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; hyperlink?: string };
    if ("result" in o) return o.result ?? null;
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text) return o.text;
    return null;
  }
  return v;
}

function readSheet(wb: ExcelJS.Workbook, name: string, firstHeader: string): Row[] {
  const ws = wb.getWorksheet(name);
  if (!ws) throw blocked(`The workbook has no "${name}" sheet. Is this the OGSERC Registry & Evaluation workbook?`);
  let headerRow = 0;
  const cols = new Map<string, number>();
  for (let r = 1; r <= 12 && !headerRow; r++) {
    const row = ws.getRow(r);
    row.eachCell((c, i) => {
      const v = cellValue(c.value);
      if (typeof v === "string" && norm(v) === norm(firstHeader)) headerRow = r;
      void i;
    });
    if (headerRow) row.eachCell((c, i) => {
      const v = cellValue(c.value);
      if (typeof v === "string" && !cols.has(norm(v))) cols.set(norm(v), i);
    });
  }
  if (!headerRow) throw blocked(`"${name}": header "${firstHeader}" not found in the first 12 rows.`);
  const out: Row[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (h: string) => {
      const i = cols.get(norm(h));
      return i ? cellValue(row.getCell(i).value) : null;
    };
    const text = (h: string) => {
      const v = get(h);
      if (v === null || v === undefined || v === "") return null;
      if (v instanceof Date) return v.toISOString();
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const firstText = text(firstHeader);
    const anyExample = (row.values as ExcelJS.CellValue[]).some((v) => {
      const x = cellValue(v);
      return typeof x === "string" && /\bEXAMPLE\b/.test(x);
    });
    out.push({ n: r, get, text, isExample: anyExample, isEmpty: !firstText });
  }
  return out.filter((r) => !r.isEmpty);
}

/** Excel stores wall-clock times; exceljs returns them as UTC. Read them as Lagos time. */
function lagosAt(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const iso = v.toISOString();
    return lagosInstant(iso.slice(0, 10), iso.slice(11, 19));
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return lagosInstant(v.slice(0, 10), v.length >= 16 ? v.slice(11, 16) : "00:00");
  return null;
}
function dateOnly(v: unknown): LocalDate | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && isLocalDate(v.slice(0, 10))) return v.slice(0, 10);
  return null;
}
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
};
const yn = (v: string | null): boolean | null => (v === "Y" ? true : v === "N" ? false : null);
const serialOf = (no: string) => Number(no.split("/").pop());
const sameText = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

// ------------------------------------------------------------------ the import

export async function importWorkbook(
  db: Db,
  actor: Actor | null,
  input: { buffer: Buffer; sourceName: string; mode: ImportMode; dryRun: boolean },
  opts: { system?: boolean } = {},
): Promise<ImportReport> {
  if (!opts.system) authorize(actor, "settings:write");
  const by: AuditActor = actor ? auditActor(actor) : SYSTEM_ACTOR;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(input.buffer as unknown as ArrayBuffer);
  } catch {
    throw blocked("This file could not be read as an Excel workbook (.xlsm / .xlsx).");
  }
  const sheets = {
    files: readSheet(wb, "File Index", "File Reference"),
    frontDesk: readSheet(wb, "Front Desk Log", "Date & Time Received"),
    inward: readSheet(wb, "Inward Register", "Date & Time Received"),
    outward: readSheet(wb, "Outward Register", "Date of Document"),
    movements: readSheet(wb, "File Movement", "Date & Time Out"),
  };
  const regSheets = {
    Register: readSheet(wb, "Register", "Ack No."),
    Payments: readSheet(wb, "Payments", "Payment No."),
    "Own-Use": readSheet(wb, "Own-Use", "OUN No."),
  };

  const report: ImportReport = {
    source: input.sourceName,
    sha256: createHash("sha256").update(input.buffer).digest("hex"),
    mode: input.mode,
    dryRun: input.dryRun,
    sheets: {},
    notes: [],
    notImported: [],
    counters: [],
  };
  for (const [name, rows] of Object.entries(regSheets)) {
    const real = rows.filter((r) => !r.isExample);
    if (real.length) report.notImported.push(`${name}: ${real.length} row(s) (rows ${real.map((r) => r.n).join(", ")}). Enter them through the app so every rule applies.`);
  }
  const wanted = (r: Row) => (input.mode === "examples" ? r.isExample : !r.isExample);
  const sheet = (name: string, rows: Row[]): SheetReport => {
    const s: SheetReport = { found: rows.length, imported: 0, skippedExample: 0, skippedReal: 0, alreadyThere: 0, errors: [] };
    for (const r of rows) {
      if (wanted(r)) continue;
      if (r.isExample) s.skippedExample++;
      else s.skippedReal++;
    }
    report.sheets[name] = s;
    return s;
  };

  class DryRun extends Error {}
  try {
    await db.transaction(async (tx) => {
      const ref = await loadRegistryRef(tx);
      const [settings, holidays] = [await getSettings(tx), await getHolidaySet(tx)];
      const people = await tx.select({ id: users.id, name: users.name }).from(users);
      const sigs = await tx.select().from(signatories);
      const userId = (name: string | null) => (name ? (people.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id ?? null) : null);
      const unitId = (name: string | null) => (name ? (ref.units.find((u) => u.name.toLowerCase() === name.toLowerCase())?.id ?? null) : null);
      const typeId = (name: string | null) => (name ? (ref.types.find((t) => t.name.toLowerCase() === name.toLowerCase())?.id ?? null) : null);
      const placeholders = new Set<string>();
      const person = (name: string | null) => {
        if (name && !userId(name)) placeholders.add(name);
        return { id: userId(name), name };
      };
      const phone = (raw: unknown, where: string): string | null => {
        if (raw === null || raw === undefined || raw === "") return null;
        const s = String(raw).trim();
        const ok = validatePhone(s);
        if (ok.ok) return ok.value;
        const fixed = validatePhone(`0${s}`);
        if (/^[789]\d{9}$/.test(s) && fixed.ok) {
          report.notes.push(`${where}: phone ${s} restored to ${fixed.value} (the workbook dropped the leading zero) [G5].`);
          return fixed.value;
        }
        report.notes.push(`${where}: phone "${s}" is not a valid Nigerian number; kept as written.`);
        return s;
      };
      const audit = (entityType: string, entityId: string, reference: string, detail: string) =>
        writeAudit(tx, { actor: by, action: "Imported from workbook", module: "system", entityType, entityId, reference, detail: `${detail} (${input.sourceName}, row data as found)` });
      const isExample = input.mode === "examples";

      // Files
      const fs = sheet("File Index", sheets.files);
      const fileIds = new Map<string, string>();
      const fileKeys = new Map<string, string>();
      for (const f of await tx.select({ id: files.id, ref: files.fileRef, title: files.title }).from(files)) {
        fileIds.set(f.ref, f.id);
        fileKeys.set(f.ref, f.title);
      }
      for (const r of sheets.files.filter(wanted)) {
        const refNo = r.text("File Reference")!.toUpperCase();
        if (fileIds.has(refNo)) {
          if (sameText(fileKeys.get(refNo), r.text("File Title"))) fs.alreadyThere++;
          else fs.errors.push(`${refNo}: the app already has a different file with this reference ("${fileKeys.get(refNo)}"); not imported.`);
          continue;
        }
        const cls = ref.fileClasses.find((c) => c.name === r.text("File Class")) ?? ref.fileClasses.find((c) => refNo.split("/")[1] === c.code);
        if (!cls) {
          fs.errors.push(`Row ${r.n} (${refNo}): unknown file class "${r.text("File Class")}".`);
          continue;
        }
        const [row] = await tx
          .insert(files)
          .values({
            fileRef: refNo,
            title: r.text("File Title") ?? refNo,
            fileClass: cls.name,
            owningUnitId: unitId(r.text("Owning Unit")),
            openedOn: dateOnly(r.get("Date Opened")) ?? dateOnly(new Date())!,
            currentVolume: int(r.get("Current Volume")) ?? 1,
            security: r.text("Security") ?? "Open",
            status: r.text("File Status") ?? "Open",
            closedOn: dateOnly(r.get("Date Closed / Archived")),
            remarks: r.text("Remarks"),
            isExample,
          })
          .returning({ id: files.id });
        fileIds.set(refNo, row.id);
        fs.imported++;
        await audit("file", row.id, refNo, "File");
        // Keep the per-class counter past imported references.
        const serial = serialOf(refNo);
        if (Number.isInteger(serial) && refNo === `OGSERC/${cls.code}/${String(serial).padStart(3, "0")}`) {
          await tx.execute(sql`insert into counters (series, year, scope, last_value) values ('FILE', 0, ${cls.code}, ${serial})
            on conflict (series, year, scope) do update set last_value = greatest(counters.last_value, ${serial})`);
        }
      }

      // Front desk
      const fds = sheet("Front Desk Log", sheets.frontDesk);
      const fdIds = new Map<string, string>();
      const fdKeys = new Map<string, string>();
      for (const f of await tx.select({ id: frontDeskItems.id, no: frontDeskItems.fdNo, sender: frontDeskItems.sender }).from(frontDeskItems)) {
        fdIds.set(f.no, f.id);
        fdKeys.set(f.no, f.sender);
      }
      for (const r of sheets.frontDesk.filter(wanted)) {
        const no = r.text("Issued No. (locked)") ?? r.text("Intake No. in Use") ?? r.text("Intake No. (generated)");
        const at = lagosAt(r.get("Date & Time Received"));
        if (!no || !at) {
          fds.errors.push(`Row ${r.n}: no intake number or date received.`);
          continue;
        }
        if (fdIds.has(no)) {
          if (sameText(fdKeys.get(no), r.text("Sender / Organisation"))) fds.alreadyThere++;
          else {
            fds.errors.push(`${no}: the app already issued this number to a different item (from "${fdKeys.get(no)}"); not imported.`);
            fdIds.delete(no);
          }
          continue;
        }
        const typeName = r.text("Correspondence Type (if known)");
        if (typeName && !typeId(typeName)) report.notes.push(`${no}: correspondence type "${typeName}" not on the list; left blank.`);
        const rb = person(r.text("Received by (Front Desk)"));
        const [row] = await tx
          .insert(frontDeskItems)
          .values({
            fdNo: no,
            fdYear: yearOf(no.split("/")[2] + "-01-01"),
            receivedAt: at,
            sender: r.text("Sender / Organisation") ?? "(not given)",
            subject: r.text("Subject / Description") ?? "(not given)",
            correspondenceTypeId: typeId(typeName),
            mode: r.text("Mode of Receipt") ?? "Hand delivery",
            deliveredBy: r.text("Delivered by"),
            phone: phone(r.get("Phone"), no),
            volumes: int(r.get("No. of Items / Volumes")),
            receivedByUserId: rb.id,
            receivedByName: rb.name,
            remarks: r.text("Remarks"),
            isExample,
          })
          .returning({ id: frontDeskItems.id });
        fdIds.set(no, row.id);
        fds.imported++;
        await audit("front_desk_item", row.id, no, `Front desk item from ${r.text("Sender / Organisation")}`);
      }

      // Inward
      const ins = sheet("Inward Register", sheets.inward);
      const ackIds = new Map<string, string>();
      const ackKeys = new Map<string, string>();
      for (const i of await tx.select({ id: inwardItems.id, no: inwardItems.ackNo, sender: inwardItems.sender }).from(inwardItems)) {
        ackIds.set(i.no, i.id);
        ackKeys.set(i.no, i.sender);
      }
      const responseLinks: { id: string; outNo: string; ack: string }[] = [];
      for (const r of sheets.inward.filter(wanted)) {
        const no = r.text("Issued No. (paste value to lock)") ?? r.text("Inward / Ack. No. in Use");
        const at = lagosAt(r.get("Date & Time Received"));
        const mode = r.text("Mode of Receipt");
        if (!no || !at || !mode) {
          ins.errors.push(`Row ${r.n}: number, date received or mode missing.`);
          continue;
        }
        if (ackIds.has(no)) {
          if (sameText(ackKeys.get(no), r.text("Sender / Organisation"))) ins.alreadyThere++;
          else ins.errors.push(`${no}: the app already issued this number to a different item (from "${ackKeys.get(no)}"); not imported.`);
          continue;
        }
        const typeName = r.text("Correspondence Type");
        if (!typeId(typeName)) report.notes.push(`${no}: correspondence type "${typeName}" not on the list; left blank.`);
        const deemed = dateOnly(r.get("Deemed Receipt Date (para 10(3))")) ?? deemedReceiptDate({ receivedAt: at, mode, closingTime: settings.officeClosingTime, holidays });
        const rb = person(r.text("Received by (Registry Officer)"));
        const routedBy = person(r.text("Routed by (Secretary / Head of Admin)"));
        const fileRef = r.text("File Reference")?.toUpperCase() ?? null;
        if (fileRef && !fileIds.has(fileRef)) report.notes.push(`${no}: file ${fileRef} is not in the File Index; link left blank.`);
        const override = r.text("Forward to Unit (override)");
        const amount = typeof r.get("Amount Shown (₦)") === "number" ? Math.round((r.get("Amount Shown (₦)") as number) * 100) : null;
        const fdNo = r.text("Front Desk Intake No.");
        const [row] = await tx
          .insert(inwardItems)
          .values({
            ackNo: no,
            ackYear: Number(no.split("/")[2]),
            receivedAt: at,
            mode,
            deemedReceiptDate: deemed,
            correspondenceTypeId: typeId(typeName),
            sender: r.text("Sender / Organisation") ?? "(not given)",
            senderCategory: r.text("Sender Category"),
            senderRef: r.text("Sender's Ref. No."),
            documentDate: dateOnly(r.get("Date on Document")),
            subject: r.text("Subject / Brief Description") ?? "(not given)",
            cacNo: r.text("CAC / Reg. No."),
            relatedOgsercNo: r.text("Related OGSERC No. (registration / earlier ack.)"),
            lga: r.text("Principal LGA"),
            contactPerson: r.text("Contact Person"),
            phone: phone(r.get("Phone"), no),
            email: r.text("Email"),
            deliveredBy: r.text("Delivered / Sent by"),
            volumes: int(r.get("No. of Files / Volumes")),
            schedule2Count: int(r.get("Schedule 2 Docs Attached (12 req.; 13 multi-State)")),
            feeEvidence: yn(r.text("Fee Evidence? (Y/N)")),
            paymentReference: r.text("Payment Reference"),
            amountShownKobo: amount,
            receivedByUserId: rb.id,
            receivedByPlaceholder: rb.id ? null : rb.name,
            ackIssuedVia: r.text("Acknowledgement Issued Via"),
            fileId: fileRef ? (fileIds.get(fileRef) ?? null) : null,
            unitOverrideId: unitId(override),
            actionRequired: r.text("Action Required"),
            priority: r.text("Priority (blank = Normal)"),
            actionOfficer: r.text("Action Officer"),
            responseDueOverride: dateOnly(r.get("Response Due (override)")),
            routedByUserId: routedBy.id,
            routedAt: lagosAt(r.get("Routed on")),
            forwardedOn: dateOnly(r.get("Date Forwarded")),
            unitOfficerReceivedBy: r.text("Received by (Unit Officer)"),
            closedManualOn: dateOnly(r.get("Date Closed (manual, if no letter)")),
            ackEmailedTo: r.text("Ack. emailed to"),
            ackEmailedAt: lagosAt(r.get("Ack. emailed on")),
            frontDeskItemId: fdNo ? (fdIds.get(fdNo) ?? null) : null,
            source: "import",
            remarks: r.text("Remarks"),
            isExample,
          })
          .returning({ id: inwardItems.id });
        ackIds.set(no, row.id);
        ins.imported++;
        if (fdNo && fdIds.has(fdNo)) await tx.update(frontDeskItems).set({ inwardItemId: row.id, registeredAt: at }).where(eq(frontDeskItems.id, fdIds.get(fdNo)!));
        const resp = r.text("In Response to Our Ref. (outward no.)");
        if (resp) responseLinks.push({ id: row.id, outNo: resp, ack: no });
        await audit("inward_item", row.id, no, `Inward item from ${r.text("Sender / Organisation")}`);
      }

      // Outward
      const outs = sheet("Outward Register", sheets.outward);
      const outIds = new Map<string, string>();
      const outKeys = new Map<string, string>();
      for (const o of await tx.select({ id: outwardItems.id, no: outwardItems.outNo, to: outwardItems.addressee }).from(outwardItems)) {
        outIds.set(o.no, o.id);
        outKeys.set(o.no, o.to);
      }
      for (const r of sheets.outward.filter(wanted)) {
        const no = r.text("Issued No. (paste value to lock)") ?? r.text("Outward No. in Use");
        const docDate = dateOnly(r.get("Date of Document"));
        if (!no || !docDate) {
          outs.errors.push(`Row ${r.n}: number or date of document missing.`);
          continue;
        }
        if (outIds.has(no)) {
          if (sameText(outKeys.get(no), r.text("Addressee / Recipient"))) outs.alreadyThere++;
          else outs.errors.push(`${no}: the app already issued this number to a different item (to "${outKeys.get(no)}"); not imported.`);
          continue;
        }
        const unit = unitId(r.text("Originating Unit"));
        if (!unit) {
          outs.errors.push(`${no}: originating unit "${r.text("Originating Unit")}" is not on the list; not imported.`);
          continue;
        }
        const signer = r.text("Signed by") ?? "(not recorded)";
        const sig = sigs.find((x) => x.name.toLowerCase() === signer.toLowerCase());
        if (!sig) report.notes.push(`${no}: signatory "${signer}" is not on Admin › Signatories; kept as text.`);
        const reply = r.text("In Reply to (inward no.)");
        const fileRef = r.text("File Reference")?.toUpperCase() ?? null;
        const re = r.text("Response Expected? (Y/N; blank = type default)");
        const [row] = await tx
          .insert(outwardItems)
          .values({
            outNo: no,
            outYear: Number(no.split("/")[2]),
            documentDate: docDate,
            documentType: r.text("Document Type") ?? "Other",
            subject: r.text("Subject") ?? "(not given)",
            addressee: r.text("Addressee / Recipient") ?? "(not given)",
            recipientCategory: r.text("Recipient Category") ?? "Other",
            recipientContact: r.text("Recipient Address / Email"),
            inReplyToInwardId: reply ? (ackIds.get(reply) ?? null) : null,
            relatedOgsercNo: r.text("Related OGSERC No. (registration / licence)"),
            fileId: fileRef ? (fileIds.get(fileRef) ?? null) : null,
            originatingUnitId: unit,
            preparedBy: r.text("Prepared by"),
            signatoryId: sig?.id ?? null,
            signatoryName: sig?.name ?? signer,
            signatoryDesignation: r.text("Signatory Designation") ?? sig?.designation ?? null,
            dispatchMode: r.text("Dispatch Mode") ?? "Hand delivery",
            dispatchedOn: dateOnly(r.get("Date Dispatched")),
            dispatchedByUserId: person(r.text("Dispatched by (Registry Officer)")).id,
            trackingRef: r.text("Tracking / Email / Courier Ref."),
            deliveryConfirmed: r.text("Delivery Confirmed? (Y/N)") === "Y",
            deliveredOn: dateOnly(r.get("Date Delivered / Acknowledged")),
            receivedByRecipient: r.text("Received by (Recipient)"),
            responseExpected: yn(re),
            responseDueOverride: dateOnly(r.get("Response Due (override)")),
            remarks: r.text("Remarks"),
            isExample,
          })
          .returning({ id: outwardItems.id });
        outIds.set(no, row.id);
        outs.imported++;
        if (reply && !ackIds.has(reply)) report.notes.push(`${no}: in reply to ${reply}, which is not in the Inward Register; link left blank.`);
        await audit("outward_item", row.id, no, `Outward item to ${r.text("Addressee / Recipient")}`);
      }
      for (const l of responseLinks) {
        const id = outIds.get(l.outNo);
        if (id) await tx.update(inwardItems).set({ inResponseToOutwardId: id }).where(eq(inwardItems.id, l.id));
        else report.notes.push(`${l.ack}: in response to ${l.outNo}, which is not in the Outward Register; link left blank.`);
      }

      // File movements
      const ms = sheet("File Movement", sheets.movements);
      for (const r of sheets.movements.filter(wanted)) {
        const fileRef = r.text("File Reference")?.toUpperCase() ?? null;
        const out = lagosAt(r.get("Date & Time Out"));
        const fid = fileRef ? fileIds.get(fileRef) : undefined;
        const unit = unitId(r.text("Unit"));
        if (!fid || !out || !unit) {
          ms.errors.push(`Row ${r.n}: ${!fid ? `file ${fileRef} not in the File Index` : !out ? "no date out" : `unit "${r.text("Unit")}" not on the list`}; not imported.`);
          continue;
        }
        const [dupe] = await tx.select({ id: fileMovements.id }).from(fileMovements).where(sql`${fileMovements.fileId} = ${fid} and ${fileMovements.outAt} = ${out}`);
        if (dupe) {
          ms.alreadyThere++;
          continue;
        }
        const rel = person(r.text("Released by (Registry)"));
        const back = person(r.text("Received Back by"));
        const returned = dateOnly(r.get("Date Returned"));
        const [row] = await tx
          .insert(fileMovements)
          .values({
            fileId: fid,
            outAt: out,
            volume: int(r.get("Volume")),
            releasedByUserId: rel.id,
            releasedByName: rel.name,
            issuedTo: r.text("Issued to (Officer)") ?? "(not recorded)",
            unitId: unit,
            purpose: r.text("Purpose"),
            returnByOverride: dateOnly(r.get("Return By (override)")),
            returnedAt: returned ? lagosInstant(returned, "12:00") : null,
            receivedBackByUserId: back.id,
            receivedBackByName: back.name,
            remarks: r.text("Remarks"),
            isExample,
          })
          .returning({ id: fileMovements.id });
        ms.imported++;
        await audit("file", fid, fileRef!, `Movement to ${r.text("Issued to (Officer)")} out ${r.text("Date & Time Out")} (movement ${row.id})`);
      }

      // Counters: never issue a number already used in the workbook.
      for (const [series, nos] of [
        ["FD", [...fdIds.keys()]],
        ["ACK", [...ackIds.keys()]],
        ["OUT", [...outIds.keys()]],
      ] as const) {
        const maxByYear = new Map<number, number>();
        for (const no of nos) {
          const [, , y, s] = no.split("/");
          const year = Number(y);
          const serial = Number(s);
          if (Number.isInteger(year) && Number.isInteger(serial)) maxByYear.set(year, Math.max(maxByYear.get(year) ?? 0, serial));
        }
        for (const [year, serial] of maxByYear) {
          const res = await tx.execute<{ last_value: number }>(sql`insert into counters (series, year, scope, last_value) values (${series}, ${year}, '', ${serial})
            on conflict (series, year, scope) do update set last_value = greatest(counters.last_value, ${serial}) returning last_value`);
          report.counters.push(`${series} ${year}: next is ${Number(res.rows[0].last_value) + 1}`);
        }
      }

      for (const p of placeholders) report.notes.push(`"${p}" is not a user account: kept as the name written in the workbook [G6].`);

      await tx.insert(importRuns).values({
        userId: actor?.id ?? null,
        userName: by.name,
        sourceName: input.sourceName,
        sha256: report.sha256,
        mode: input.mode,
        dryRun: input.dryRun ? 1 : 0,
        report,
      });
      if (!input.dryRun) {
        const total = Object.values(report.sheets).reduce((n, s) => n + s.imported, 0);
        await writeAudit(tx, { actor: by, action: "Workbook import", module: "system", detail: `${input.sourceName}: ${total} record(s) imported (${input.mode})`, data: report });
      }
      if (input.dryRun) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    // Keep the dry-run report (the records were rolled back).
    await db.insert(importRuns).values({ userId: actor?.id ?? null, userName: by.name, sourceName: input.sourceName, sha256: report.sha256, mode: input.mode, dryRun: 1, report });
  }
  return report;
}

/** Plain-text report (CLI and the Import page). */
export function formatReport(r: ImportReport): string {
  const lines = [
    `Import report: ${r.source}${r.dryRun ? " (DRY RUN: nothing kept)" : ""}`,
    `Mode: ${r.mode === "real" ? "real records (EXAMPLE rows skipped)" : "EXAMPLE rows only"} · SHA-256 ${r.sha256.slice(0, 16)}…`,
    "",
    "Sheet                 found  imported  already  skipped  errors",
  ];
  for (const [name, s] of Object.entries(r.sheets)) {
    lines.push(
      `${name.padEnd(20)} ${String(s.found).padStart(6)} ${String(s.imported).padStart(9)} ${String(s.alreadyThere).padStart(8)} ${String(s.skippedExample + s.skippedReal).padStart(8)} ${String(s.errors.length).padStart(7)}`,
    );
  }
  const section = (title: string, items: string[]) => (items.length ? ["", `${title}:`, ...items.map((x) => `  - ${x}`)] : []);
  lines.push(...section("Errors", Object.values(r.sheets).flatMap((s) => s.errors)));
  lines.push(...section("Notes", r.notes));
  lines.push(...section("Not imported", r.notImported));
  lines.push(...section("Counters", r.counters));
  return lines.join("\n");
}

export async function listImportRuns(db: Db, limit = 20) {
  return db.select().from(importRuns).orderBy(sql`${importRuns.at} desc`).limit(limit);
}

