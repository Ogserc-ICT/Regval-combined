/**
 * Files and file movements (SPEC §22; RegistryDesk.NewFile, IssueFile, ReturnFile).
 * File references are OGSERC/{class code}/{nnn}, generated per class and
 * overtypeable (unique). The series does not reset each year (Open: Q5).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { addWorkingDays } from "@/domain/workdays";
import { formatNumber } from "@/domain/numbering";
import { lagosDate } from "@/domain/dates";
import { auditActor, authorize, type Actor } from "../../auth/actor";
import { writeAudit } from "../../audit";
import type { Db, Tx } from "../../db/connect";
import { fileMovements, files } from "../../db/schema";
import { blocked, needsConfirmation, notFound, Problems } from "../../errors";
import { issueNumber } from "../../numbering";
import { lagosToday, serverNow } from "../../time";
import { getHolidaySet } from "../holidays";
import { getSettings } from "../settings";
import { inList, optionalCount, optionalDate, t } from "./common";
import { loadRegistryRef } from "./ref";

export type NewFileInput = {
  fileClass: string;
  /** Overtype the generated reference (must be unique). */
  fileRef?: string | null;
  title: string;
  owningUnitId?: string | null;
  openedOn?: string | null;
  currentVolume?: number | null;
  security?: string | null;
  remarks?: string | null;
};

const REF_PATTERN = /^[A-Z0-9][A-Z0-9/ .-]*$/;

export async function openFile(db: Db, actor: Actor | null, input: NewFileInput): Promise<{ id: string; fileRef: string }> {
  authorize(actor, "files:write");
  return db.transaction(async (tx) => {
    const ref = await loadRegistryRef(tx);
    const p = new Problems();
    const cls = ref.fileClasses.find((c) => c.name === input.fileClass);
    if (!cls) p.field("fileClass", "File class is required (from the list).");
    const title = t(input.title);
    if (!title) p.field("title", "Title is required.");
    const unitId = t(input.owningUnitId);
    if (unitId && !ref.unit(unitId)) p.field("owningUnitId", "Choose the unit from the list.");
    const openedOn = optionalDate(p, "openedOn", input.openedOn, "Date opened") ?? lagosToday();
    if (openedOn > lagosToday()) p.field("openedOn", "Date opened cannot be in the future.");
    const volume = optionalCount(p, "currentVolume", input.currentVolume, "Volume") ?? 1;
    if (volume < 1) p.field("currentVolume", "Volume starts at 1.");
    const security = inList(p, "security", input.security || "Open", ref.security, "Security");
    const typed = t(input.fileRef)?.toUpperCase() ?? null;
    if (typed && !REF_PATTERN.test(typed)) p.field("fileRef", "Use letters, digits and / . - only.");
    if (typed) {
      const [clash] = await tx.select({ id: files.id }).from(files).where(eq(files.fileRef, typed));
      if (clash) p.field("fileRef", `${typed} is already in the File Index.`);
    }
    p.throwIfAny();

    let fileRef = typed;
    while (!fileRef) {
      const { number } = await issueNumber(tx, "FILE", { scope: cls!.code });
      const [clash] = await tx.select({ id: files.id }).from(files).where(eq(files.fileRef, number));
      if (!clash) fileRef = number; // skip a number already typed in by hand
    }
    const [row] = await tx
      .insert(files)
      .values({ fileRef, title: title!, fileClass: cls!.name, owningUnitId: unitId, openedOn, currentVolume: volume, security: security!, status: "Open", remarks: t(input.remarks), createdBy: actor.id })
      .returning({ id: files.id });
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "File opened",
      module: "registry",
      entityType: "file",
      entityId: row.id,
      reference: fileRef,
      detail: `${title} (${cls!.name})${typed ? "; reference typed by the officer" : ""}`,
    });
    return { id: row.id, fileRef };
  });
}

/** The next reference that would be generated for a class (display only). */
export function previewFileRef(code: string, lastSerial: number): string {
  return formatNumber({ series: "FILE", serial: lastSerial + 1, scope: code });
}

export type FileUpdate = { title?: string; owningUnitId?: string | null; currentVolume?: number | null; security?: string; status?: string; remarks?: string | null };

export async function updateFile(db: Db, actor: Actor | null, id: string, input: FileUpdate): Promise<string[]> {
  authorize(actor, "files:write");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(files).where(eq(files.id, id)).for("update");
    if (!row) throw notFound("File");
    const ref = await loadRegistryRef(tx);
    const p = new Problems();
    const next: Partial<typeof files.$inferInsert> = {};
    if (input.title !== undefined) {
      const v = t(input.title);
      if (!v) p.field("title", "Title is required.");
      else next.title = v;
    }
    if (input.owningUnitId !== undefined) {
      const v = t(input.owningUnitId);
      if (v && !ref.unit(v)) p.field("owningUnitId", "Choose the unit from the list.");
      next.owningUnitId = v;
    }
    if (input.currentVolume !== undefined) next.currentVolume = optionalCount(p, "currentVolume", input.currentVolume, "Volume") ?? row.currentVolume;
    if (input.security !== undefined) next.security = inList(p, "security", input.security, ref.security, "Security") ?? row.security;
    if (input.status !== undefined) {
      next.status = inList(p, "status", input.status, ref.fileStatus, "Status") ?? row.status;
      if (next.status !== "Open" && row.status === "Open") next.closedOn = lagosToday();
      if (next.status === "Open") next.closedOn = null;
    }
    if (input.remarks !== undefined) next.remarks = t(input.remarks);
    p.throwIfAny();
    const changes = Object.entries(next)
      .filter(([k, v]) => ((row as Record<string, unknown>)[k] ?? null) !== (v ?? null))
      .map(([k, v]) => `${k}: ${(row as Record<string, unknown>)[k] ?? "—"} → ${v ?? "—"}`);
    if (!changes.length) return [];
    await tx.update(files).set({ ...next, updatedAt: new Date() }).where(eq(files.id, id));
    await writeAudit(tx, { actor: auditActor(actor), action: "Edited", module: "registry", entityType: "file", entityId: id, reference: row.fileRef, detail: changes.join("; ") });
    return changes;
  });
}

async function lockFile(tx: Tx, id: string) {
  const [row] = await tx.select().from(files).where(eq(files.id, id)).for("update");
  if (!row) throw notFound("File");
  return row;
}

export type IssueInput = { fileId: string; volume?: number | null; issuedTo: string; unitId: string; purpose?: string | null; returnByOverride?: string | null; remarks?: string | null };

/** Issue a file to an officer. Warns when it is already out. Released by = the user ([G6]). */
export async function issueFile(db: Db, actor: Actor | null, input: IssueInput, opts: { confirm?: boolean } = {}): Promise<{ returnDue: string }> {
  authorize(actor, "files:write");
  return db.transaction(async (tx) => {
    const file = await lockFile(tx, input.fileId);
    const [ref, settings, holidays] = [await loadRegistryRef(tx), await getSettings(tx), await getHolidaySet(tx)];
    const p = new Problems();
    const issuedTo = t(input.issuedTo);
    if (!issuedTo) p.field("issuedTo", "Issued to (officer) is required.");
    if (!ref.unit(input.unitId)) p.field("unitId", "Unit is required (an OGSERC unit from the list).");
    const volume = optionalCount(p, "volume", input.volume, "Volume");
    const override = optionalDate(p, "returnByOverride", input.returnByOverride, "Return by");
    const today = lagosToday();
    if (override && override < today) p.field("returnByOverride", "Return by cannot be in the past.");
    p.throwIfAny();
    const [out] = await tx
      .select({ issuedTo: fileMovements.issuedTo, outAt: fileMovements.outAt })
      .from(fileMovements)
      .where(and(eq(fileMovements.fileId, file.id), isNull(fileMovements.returnedAt)))
      .orderBy(desc(fileMovements.outAt))
      .limit(1);
    if (out && !opts.confirm) throw needsConfirmation(`${file.fileRef} is already out with ${out.issuedTo} since ${lagosDate(out.outAt)}. Issue it again anyway?`);
    if (file.status !== "Open" && !opts.confirm) throw needsConfirmation(`${file.fileRef} is ${file.status}. Issue it anyway?`);
    const outAt = serverNow();
    const returnDue = override ?? addWorkingDays(lagosDate(outAt), settings.fileReturnDays, holidays);
    const [m] = await tx
      .insert(fileMovements)
      .values({
        fileId: file.id,
        outAt,
        volume: volume ?? file.currentVolume,
        releasedByUserId: actor.id,
        releasedByName: actor.name,
        issuedTo: issuedTo!,
        unitId: input.unitId,
        purpose: t(input.purpose),
        returnByOverride: override,
        remarks: t(input.remarks),
      })
      .returning({ id: fileMovements.id });
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "File issued",
      module: "registry",
      entityType: "file",
      entityId: file.id,
      reference: file.fileRef,
      detail: `Issued to ${issuedTo} (${ref.unit(input.unitId)!.name}); return by ${returnDue}${t(input.purpose) ? `; ${t(input.purpose)}` : ""}${out ? `; was still out with ${out.issuedTo}` : ""}`,
      data: { movementId: m.id },
    });
    return { returnDue };
  });
}

/** Return: the latest unreturned movement of the file. Received back by = the user. */
export async function returnFile(db: Db, actor: Actor | null, fileId: string): Promise<{ from: string }> {
  authorize(actor, "files:write");
  return db.transaction(async (tx) => {
    const file = await lockFile(tx, fileId);
    const [m] = await tx
      .select()
      .from(fileMovements)
      .where(and(eq(fileMovements.fileId, file.id), isNull(fileMovements.returnedAt)))
      .orderBy(desc(fileMovements.outAt))
      .limit(1);
    if (!m) throw blocked(`${file.fileRef} is not out. Nothing to return.`);
    await tx
      .update(fileMovements)
      .set({ returnedAt: serverNow(), receivedBackByUserId: actor.id, receivedBackByName: actor.name })
      .where(eq(fileMovements.id, m.id));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "File returned",
      module: "registry",
      entityType: "file",
      entityId: file.id,
      reference: file.fileRef,
      detail: `Returned by ${m.issuedTo}; received back by ${actor.name}`,
    });
    return { from: m.issuedTo };
  });
}
