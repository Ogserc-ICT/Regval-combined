/**
 * Outward items (SPEC §21; RegistryDesk.SaveOutward, DispatchedToday,
 * DeliveredToday). "Save & get number" issues the OUT number before signature.
 * A reply quoting an inward ACK closes that item when it is dispatched.
 */
import { eq } from "drizzle-orm";
import { yearOf } from "@/domain/dates";
import { auditActor, authorize, type Actor } from "../../auth/actor";
import { writeAudit } from "../../audit";
import type { Db, Tx } from "../../db/connect";
import { files, inwardItems, outwardItems, signatories } from "../../db/schema";
import { blocked, notFound, Problems } from "../../errors";
import { issueNumber } from "../../numbering";
import { lagosToday } from "../../time";
import { inList, optionalDate, t } from "./common";
import { loadRegistryRef } from "./ref";

export type OutwardInput = {
  documentDate: string;
  documentType: string;
  subject: string;
  addressee: string;
  recipientCategory: string;
  recipientContact?: string | null;
  /** Inward ACK this replies to. */
  inReplyToAck?: string | null;
  relatedOgsercNo?: string | null;
  fileRef?: string | null;
  originatingUnitId: string;
  preparedBy?: string | null;
  signatoryId: string;
  dispatchMode: string;
  dispatchedOn?: string | null;
  trackingRef?: string | null;
  /** "Y" | "N" | "" (blank = the document type's default). */
  responseExpected?: string | null;
  responseDueOverride?: string | null;
  remarks?: string | null;
};

async function fileIdByRef(tx: Tx, p: Problems, ref: string | null) {
  if (!ref) return null;
  const [f] = await tx.select({ id: files.id }).from(files).where(eq(files.fileRef, ref.toUpperCase()));
  if (!f) p.field("fileRef", `${ref} is not in the File Index.`);
  return f?.id ?? null;
}

export async function saveOutward(db: Db, actor: Actor | null, input: OutwardInput): Promise<{ id: string; outNo: string; replyTo: string | null }> {
  authorize(actor, "outward:write");
  return db.transaction(async (tx) => {
    const ref = await loadRegistryRef(tx);
    const p = new Problems();
    const today = lagosToday();
    const documentDate = optionalDate(p, "documentDate", input.documentDate, "Date of document");
    if (!t(input.documentDate)) p.field("documentDate", "Date of document is required.");
    else if (documentDate && documentDate > today) p.field("documentDate", "Date of document cannot be in the future.");
    const docType = inList(p, "documentType", input.documentType, ref.outgoingTypes.map((o) => o.name), "Document type");
    const subject = t(input.subject);
    if (!subject) p.field("subject", "Subject is required.");
    const addressee = t(input.addressee);
    if (!addressee) p.field("addressee", "Addressee is required.");
    const recipientCategory = inList(p, "recipientCategory", input.recipientCategory, ref.senderCategories, "Recipient category");
    const unit = ref.unit(input.originatingUnitId);
    if (!unit) p.field("originatingUnitId", "Originating unit is required (from the list).");
    const [sig] = input.signatoryId ? await tx.select().from(signatories).where(eq(signatories.id, input.signatoryId)) : [];
    if (!sig || !sig.active) p.field("signatoryId", "Signed by is required (an active signatory).");
    const dispatchMode = inList(p, "dispatchMode", input.dispatchMode, ref.modes, "Dispatch mode");
    const dispatchedOn = optionalDate(p, "dispatchedOn", input.dispatchedOn, "Date dispatched");
    if (dispatchedOn && dispatchedOn > today) p.field("dispatchedOn", "Date dispatched cannot be in the future.");
    const due = optionalDate(p, "responseDueOverride", input.responseDueOverride, "Response due");
    const re = t(input.responseExpected);
    if (re && re !== "Y" && re !== "N") p.field("responseExpected", "Response expected must be Y, N or blank.");
    let replyTo: { id: string; ackNo: string; sender: string } | null = null;
    const ack = t(input.inReplyToAck)?.toUpperCase() ?? null;
    if (ack) {
      const [i] = await tx.select({ id: inwardItems.id, ackNo: inwardItems.ackNo, sender: inwardItems.sender }).from(inwardItems).where(eq(inwardItems.ackNo, ack));
      if (!i) p.field("inReplyToAck", `${ack} is not in the Inward Register.`);
      replyTo = i ?? null;
    }
    const fileId = await fileIdByRef(tx, p, t(input.fileRef));
    p.throwIfAny();

    const year = yearOf(documentDate!);
    const { number } = await issueNumber(tx, "OUT", { year });
    const [row] = await tx
      .insert(outwardItems)
      .values({
        outNo: number,
        outYear: year,
        documentDate: documentDate!,
        documentType: docType!,
        subject: subject!,
        addressee: addressee!,
        recipientCategory: recipientCategory!,
        recipientContact: t(input.recipientContact),
        inReplyToInwardId: replyTo?.id ?? null,
        relatedOgsercNo: t(input.relatedOgsercNo),
        fileId,
        originatingUnitId: unit!.id,
        preparedBy: t(input.preparedBy),
        signatoryId: sig!.id,
        signatoryName: sig!.name,
        signatoryDesignation: sig!.designation,
        dispatchMode: dispatchMode!,
        dispatchedOn,
        dispatchedByUserId: dispatchedOn ? actor.id : null,
        trackingRef: t(input.trackingRef),
        responseExpected: re === "Y" ? true : re === "N" ? false : null,
        responseDueOverride: due,
        remarks: t(input.remarks),
        createdBy: actor.id,
      })
      .returning({ id: outwardItems.id });
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Outward saved",
      module: "registry",
      entityType: "outward_item",
      entityId: row.id,
      reference: number,
      detail: `${docType} to ${addressee} - ${subject}; signed by ${sig!.name}${replyTo ? `; reply to ${replyTo.ackNo}` : ""}${dispatchedOn ? `; dispatched ${dispatchedOn}` : ""}`,
    });
    if (replyTo && dispatchedOn) await auditReplyCloses(tx, actor, replyTo, number, dispatchedOn);
    return { id: row.id, outNo: number, replyTo: replyTo ? `${replyTo.ackNo} (${replyTo.sender})` : null };
  });
}

async function auditReplyCloses(tx: Tx, actor: Actor, inward: { id: string; ackNo: string }, outNo: string, on: string) {
  await writeAudit(tx, {
    actor: auditActor(actor),
    action: "Closed",
    module: "registry",
    entityType: "inward_item",
    entityId: inward.id,
    reference: inward.ackNo,
    detail: `Closed by the reply ${outNo}, dispatched ${on}`,
  });
}

async function lockOutward(tx: Tx, id: string) {
  const [row] = await tx.select().from(outwardItems).where(eq(outwardItems.id, id)).for("update");
  if (!row) throw notFound("Outward item");
  return row;
}

/** Dispatched (today or a given date). Dispatched by = the user ([G6]). */
export async function dispatchOutward(db: Db, actor: Actor | null, id: string, input: { date?: string | null; trackingRef?: string | null } = {}): Promise<void> {
  authorize(actor, "outward:write");
  await db.transaction(async (tx) => {
    const row = await lockOutward(tx, id);
    if (row.dispatchedOn) throw blocked(`${row.outNo} was already dispatched on ${row.dispatchedOn}.`);
    const p = new Problems();
    const today = lagosToday();
    const date = optionalDate(p, "date", input.date, "Date dispatched") ?? today;
    if (date > today) p.field("date", "Date dispatched cannot be in the future.");
    p.throwIfAny();
    const tracking = t(input.trackingRef) ?? row.trackingRef;
    await tx.update(outwardItems).set({ dispatchedOn: date, dispatchedByUserId: actor.id, trackingRef: tracking, updatedAt: new Date() }).where(eq(outwardItems.id, id));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Dispatched",
      module: "registry",
      entityType: "outward_item",
      entityId: id,
      reference: row.outNo,
      detail: `Dispatched ${date} by ${row.dispatchMode}${tracking ? `; tracking ${tracking}` : ""}${date < row.documentDate ? " (before the document date)" : ""}`,
    });
    if (row.inReplyToInwardId) {
      const [i] = await tx.select({ id: inwardItems.id, ackNo: inwardItems.ackNo }).from(inwardItems).where(eq(inwardItems.id, row.inReplyToInwardId));
      if (i) await auditReplyCloses(tx, actor, i, row.outNo, date);
    }
  });
}

/** Delivered: requires a dispatch first; sets delivery confirmed and the date. */
export async function deliverOutward(db: Db, actor: Actor | null, id: string, input: { date?: string | null; receivedBy?: string | null } = {}): Promise<void> {
  authorize(actor, "outward:write");
  await db.transaction(async (tx) => {
    const row = await lockOutward(tx, id);
    if (!row.dispatchedOn) throw blocked(`${row.outNo} has not been dispatched yet. Record the dispatch first.`);
    if (row.deliveryConfirmed) throw blocked(`Delivery of ${row.outNo} was already confirmed on ${row.deliveredOn}.`);
    const p = new Problems();
    const today = lagosToday();
    const date = optionalDate(p, "date", input.date, "Date delivered") ?? today;
    if (date > today) p.field("date", "Date delivered cannot be in the future.");
    if (date < row.dispatchedOn) p.field("date", "Date delivered cannot be before the dispatch date.");
    p.throwIfAny();
    await tx
      .update(outwardItems)
      .set({ deliveryConfirmed: true, deliveredOn: date, receivedByRecipient: t(input.receivedBy), updatedAt: new Date() })
      .where(eq(outwardItems.id, id));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Delivered",
      module: "registry",
      entityType: "outward_item",
      entityId: id,
      reference: row.outNo,
      detail: `Delivered ${date}${t(input.receivedBy) ? `; received by ${t(input.receivedBy)}` : ""}`,
    });
  });
}

export type OutwardUpdate = {
  recipientContact?: string | null;
  fileRef?: string | null;
  trackingRef?: string | null;
  responseExpected?: string | null;
  responseDueOverride?: string | null;
  remarks?: string | null;
};

/** Update item (Registry officer): handling details only; audited old → new. */
export async function updateOutward(db: Db, actor: Actor | null, id: string, input: OutwardUpdate): Promise<string[]> {
  authorize(actor, "outward:write");
  return db.transaction(async (tx) => {
    const row = await lockOutward(tx, id);
    const p = new Problems();
    const next: Partial<typeof outwardItems.$inferInsert> = {};
    if (input.recipientContact !== undefined) next.recipientContact = t(input.recipientContact);
    if (input.trackingRef !== undefined) next.trackingRef = t(input.trackingRef);
    if (input.remarks !== undefined) next.remarks = t(input.remarks);
    if (input.fileRef !== undefined) next.fileId = await fileIdByRef(tx, p, t(input.fileRef));
    if (input.responseDueOverride !== undefined) next.responseDueOverride = optionalDate(p, "responseDueOverride", input.responseDueOverride, "Response due");
    if (input.responseExpected !== undefined) {
      const re = t(input.responseExpected);
      if (re && re !== "Y" && re !== "N") p.field("responseExpected", "Response expected must be Y, N or blank.");
      next.responseExpected = re === "Y" ? true : re === "N" ? false : null;
    }
    p.throwIfAny();
    const changes = Object.entries(next)
      .filter(([k, v]) => ((row as Record<string, unknown>)[k] ?? null) !== (v ?? null))
      .map(([k, v]) => ({ field: k, from: (row as Record<string, unknown>)[k] ?? null, to: v ?? null }));
    if (!changes.length) return [];
    await tx.update(outwardItems).set({ ...next, updatedAt: new Date() }).where(eq(outwardItems.id, id));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Edited",
      module: "registry",
      entityType: "outward_item",
      entityId: id,
      reference: row.outNo,
      detail: changes.map((c) => `${c.field}: ${c.from ?? "—"} → ${c.to ?? "—"}`).join("; "),
      data: changes,
    });
    return changes.map((c) => c.field);
  });
}
