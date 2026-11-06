/**
 * Inward items: New Inward, update, route, forward, confirm receipt and close
 * (SPEC §19, §20; RegistryDesk.SaveInwardCore, SaveRoute, ForwardToday,
 * CloseToday). The ACK comes from the shared series via createInwardItem.
 */
import { and, eq } from "drizzle-orm";
import { isLocalDate, type LocalDate } from "@/domain/dates";
import { auditActor, authorize, can, type Actor } from "../../auth/actor";
import { writeAudit } from "../../audit";
import type { Db, Tx } from "../../db/connect";
import { files, inwardItems, outwardItems } from "../../db/schema";
import { blocked, forbidden, needsConfirmation, notFound, Problems } from "../../errors";
import { lagosToday } from "../../time";
import { deliverQueued, queueItemEmail } from "../email";
import { createInwardItem } from "../inward";
import { inList, optionalCount, optionalDate, optionalEmail, optionalPhone, receivedInstant, t } from "./common";
import { markFrontDeskRegistered, takeFrontDeskItem } from "./frontdesk";
import { effectiveUnitId, loadRegistryRef, type RegistryRef } from "./ref";

export type InwardInput = {
  frontDeskItemId?: string | null;
  receivedDate: string;
  receivedTime: string;
  mode: string;
  correspondenceTypeId: string;
  sender: string;
  senderCategory: string;
  subject: string;
  senderRef?: string | null;
  documentDate?: string | null;
  relatedOgsercNo?: string | null;
  /** "In response to our ref": an OUT number. */
  inResponseToOutNo?: string | null;
  cacNo?: string | null;
  lga?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  deliveredBy?: string | null;
  volumes?: number | null;
  schedule2Count?: number | null;
  feeEvidence?: boolean | null;
  paymentReference?: string | null;
  /** Kobo. */
  amountShown?: number | null;
  ackIssuedVia: string;
  remarks?: string | null;
};

export type SavedInward = { id: string; ackNo: string; warnings: string[] };

async function outwardByNo(tx: Tx, p: Problems, no: string | null, field: string) {
  if (!no) return null;
  const [o] = await tx.select({ id: outwardItems.id }).from(outwardItems).where(eq(outwardItems.outNo, no.trim().toUpperCase()));
  if (!o) p.field(field, `${no} is not in the Outward Register.`);
  return o?.id ?? null;
}

/** Common checks for New Inward and Registry Intake handling fields. */
export function checkHandling(p: Problems, ref: RegistryRef, input: Pick<InwardInput, "mode" | "ackIssuedVia" | "phone" | "email" | "volumes" | "schedule2Count" | "amountShown" | "lga">) {
  return {
    mode: inList(p, "mode", input.mode, ref.modes, "Mode of receipt"),
    ackIssuedVia: inList(p, "ackIssuedVia", input.ackIssuedVia, ref.ackVia, "Acknowledgement issued via"),
    phone: optionalPhone(p, input.phone),
    email: optionalEmail(p, input.email),
    volumes: optionalCount(p, "volumes", input.volumes, "Number of items / volumes"),
    schedule2Count: optionalCount(p, "schedule2Count", input.schedule2Count, "Schedule 2 documents attached"),
    amountShown: input.amountShown === null || input.amountShown === undefined ? null : Number.isFinite(input.amountShown) && input.amountShown >= 0 ? input.amountShown : (p.field("amountShown", "Amount must be a sum of naira (0 or more)."), null),
    lga: inList(p, "lga", input.lga, ref.lgas, "LGA", false),
  };
}

/** New Inward: issues the ACK and logs the item. The Registry does not route at registration. */
export async function saveInward(db: Db, actor: Actor | null, input: InwardInput): Promise<SavedInward> {
  authorize(actor, "inward:write");
  const r = await db.transaction(async (tx) => {
    const ref = await loadRegistryRef(tx);
    const p = new Problems();
    const fd = input.frontDeskItemId ? await takeFrontDeskItem(tx, input.frontDeskItemId) : null;
    // The front desk time becomes the receipt time (SPEC §17).
    const receivedAt = fd ? fd.receivedAt : receivedInstant(p, input.receivedDate, input.receivedTime);
    const type = ref.type(input.correspondenceTypeId);
    if (!type) p.field("correspondenceTypeId", "Correspondence type is required (from the list).");
    const sender = t(input.sender);
    if (!sender) p.field("sender", "Sender is required.");
    const senderCategory = inList(p, "senderCategory", input.senderCategory, ref.senderCategories, "Sender category");
    const subject = t(input.subject);
    if (!subject) p.field("subject", "Subject is required.");
    const h = checkHandling(p, ref, input);
    const documentDate = optionalDate(p, "documentDate", input.documentDate, "Date on document");
    const outId = await outwardByNo(tx, p, t(input.inResponseToOutNo), "inResponseToOutNo");
    p.throwIfAny();

    const inward = await createInwardItem(tx, {
      receivedAt: receivedAt!,
      mode: h.mode!,
      correspondenceTypeId: type!.id,
      sender: sender!,
      senderCategory,
      subject: subject!,
      senderRef: t(input.senderRef),
      documentDate,
      relatedOgsercNo: t(input.relatedOgsercNo),
      inResponseToOutwardId: outId,
      cacNo: t(input.cacNo),
      lga: h.lga,
      contactPerson: t(input.contactPerson),
      phone: h.phone,
      email: h.email,
      deliveredBy: t(input.deliveredBy),
      volumes: h.volumes,
      schedule2Count: h.schedule2Count,
      feeEvidence: input.feeEvidence ?? null,
      paymentReference: t(input.paymentReference),
      amountShownKobo: h.amountShown,
      ackIssuedVia: h.ackIssuedVia,
      receivedByUserId: actor.id,
      source: "new_inward",
      remarks: t(input.remarks),
      frontDeskItemId: fd?.id ?? null,
    });
    if (fd) await markFrontDeskRegistered(tx, actor, fd, inward);
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Inward saved",
      module: "registry",
      entityType: "inward_item",
      entityId: inward.id,
      reference: inward.ackNo,
      detail: `${type!.name} from ${sender} - ${subject}; deemed received ${inward.deemed}${fd ? `; from ${fd.fdNo}` : ""}`,
    });
    const q = await queueItemEmail(tx, actor, inward.id, "acknowledgement");
    const warnings = [...q.warnings];
    if (type!.filingType) warnings.push(`This is a registration filing: complete its ${type!.filingType === "OWNUSE" ? "Own-Use" : "Register"} entry on Registry Intake.`);
    return { id: inward.id, ackNo: inward.ackNo, warnings, emailIds: q.emailIds };
  });
  const problems = await deliverQueued(db, r.emailIds, auditActor(actor));
  return { id: r.id, ackNo: r.ackNo, warnings: [...problems, ...r.warnings] };
}

async function lockInward(tx: Tx, id: string) {
  const [row] = await tx.select().from(inwardItems).where(eq(inwardItems.id, id)).for("update");
  if (!row) throw notFound("Inward item");
  return row;
}

async function audit(tx: Tx, actor: Actor, row: { id: string; ackNo: string }, action: string, detail: string, data?: unknown) {
  await writeAudit(tx, { actor: auditActor(actor), action, module: "registry", entityType: "inward_item", entityId: row.id, reference: row.ackNo, detail, data });
}

export type InwardUpdate = {
  sender?: string;
  senderCategory?: string;
  senderRef?: string | null;
  documentDate?: string | null;
  subject?: string;
  relatedOgsercNo?: string | null;
  cacNo?: string | null;
  lga?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  deliveredBy?: string | null;
  volumes?: number | null;
  ackIssuedVia?: string;
  forwardedOn?: string | null;
  unitOfficerReceivedBy?: string | null;
  closedManualOn?: string | null;
  remarks?: string | null;
};

const UPDATE_LABELS: Record<keyof InwardUpdate, string> = {
  sender: "Sender",
  senderCategory: "Sender category",
  senderRef: "Sender's ref",
  documentDate: "Date on document",
  subject: "Subject",
  relatedOgsercNo: "Related OGSERC no.",
  cacNo: "CAC / reg no.",
  lga: "LGA",
  contactPerson: "Contact person",
  phone: "Phone",
  email: "Email",
  deliveredBy: "Delivered by",
  volumes: "Volumes",
  ackIssuedVia: "Acknowledgement issued via",
  forwardedOn: "Date forwarded",
  unitOfficerReceivedBy: "Receiving unit officer",
  closedManualOn: "Closed on",
  remarks: "Remarks",
};

/** Update item (Registry officer): handling details; every change is audited old → new. */
export async function updateInward(db: Db, actor: Actor | null, id: string, input: InwardUpdate): Promise<string[]> {
  authorize(actor, "inward:write");
  return db.transaction(async (tx) => {
    const row = await lockInward(tx, id);
    const ref = await loadRegistryRef(tx);
    const p = new Problems();
    const next: Partial<typeof inwardItems.$inferInsert> = {};
    if (input.sender !== undefined) {
      const v = t(input.sender);
      if (!v) p.field("sender", "Sender is required.");
      else next.sender = v;
    }
    if (input.subject !== undefined) {
      const v = t(input.subject);
      if (!v) p.field("subject", "Subject is required.");
      else next.subject = v;
    }
    if (input.senderCategory !== undefined) next.senderCategory = inList(p, "senderCategory", input.senderCategory, ref.senderCategories, "Sender category");
    if (input.ackIssuedVia !== undefined) next.ackIssuedVia = inList(p, "ackIssuedVia", input.ackIssuedVia, ref.ackVia, "Acknowledgement issued via");
    if (input.lga !== undefined) next.lga = inList(p, "lga", input.lga, ref.lgas, "LGA", false);
    if (input.phone !== undefined) next.phone = optionalPhone(p, input.phone);
    if (input.email !== undefined) next.email = optionalEmail(p, input.email);
    if (input.volumes !== undefined) next.volumes = optionalCount(p, "volumes", input.volumes, "Volumes");
    if (input.documentDate !== undefined) next.documentDate = optionalDate(p, "documentDate", input.documentDate, "Date on document");
    if (input.forwardedOn !== undefined) next.forwardedOn = optionalDate(p, "forwardedOn", input.forwardedOn, "Date forwarded");
    if (input.closedManualOn !== undefined) next.closedManualOn = optionalDate(p, "closedManualOn", input.closedManualOn, "Closed on");
    for (const k of ["senderRef", "relatedOgsercNo", "cacNo", "contactPerson", "deliveredBy", "unitOfficerReceivedBy", "remarks"] as const) {
      if (input[k] !== undefined) next[k] = t(input[k]);
    }
    const today = lagosToday();
    if (next.forwardedOn && next.forwardedOn > today) p.field("forwardedOn", "Date forwarded cannot be in the future.");
    if (next.closedManualOn && next.closedManualOn > today) p.field("closedManualOn", "Closed on cannot be in the future.");
    if (next.forwardedOn && next.forwardedOn < row.deemedReceiptDate) p.field("forwardedOn", "Date forwarded cannot be before the deemed receipt date.");
    p.throwIfAny();

    const changes: { field: string; from: unknown; to: unknown }[] = [];
    for (const [k, v] of Object.entries(next) as [keyof InwardUpdate, unknown][]) {
      const before = (row as Record<string, unknown>)[k] ?? null;
      if ((before ?? null) !== (v ?? null)) changes.push({ field: UPDATE_LABELS[k], from: before, to: v });
    }
    if (!changes.length) return [];
    await tx.update(inwardItems).set({ ...next, updatedAt: new Date() }).where(eq(inwardItems.id, id));
    await audit(tx, actor, row, "Edited", changes.map((c) => `${c.field}: ${c.from ?? "—"} → ${c.to ?? "—"}`).join("; "), changes);
    return changes.map((c) => c.field);
  });
}

export type RouteInput = {
  unitId?: string | null;
  fileRef?: string | null;
  actionRequired: string;
  priority?: string | null;
  actionOfficer?: string | null;
  responseDueOverride?: string | null;
};

/** Route / re-route (Router only, [G7]; RegistryDesk.SaveRoute). */
export async function routeInward(db: Db, actor: Actor | null, id: string, input: RouteInput): Promise<{ warnings: string[] }> {
  authorize(actor, "inward:route");
  const r = await db.transaction(async (tx) => {
    const row = await lockInward(tx, id);
    const ref = await loadRegistryRef(tx);
    const p = new Problems();
    const unitId = t(input.unitId);
    if (unitId && !ref.unit(unitId)) p.field("unitId", "Choose the unit from the list.");
    const action = inList(p, "actionRequired", input.actionRequired, ref.actions, "Action required");
    const priority = inList(p, "priority", input.priority, ref.priorities, "Priority", false) ?? "Normal";
    const due = optionalDate(p, "responseDueOverride", input.responseDueOverride, "Response due");
    if (due && due < row.deemedReceiptDate) p.field("responseDueOverride", "Response due cannot be before the deemed receipt date.");
    const fileRef = t(input.fileRef)?.toUpperCase() ?? null;
    let fileId: string | null = null;
    if (fileRef) {
      const [f] = await tx.select({ id: files.id }).from(files).where(eq(files.fileRef, fileRef));
      if (!f) p.field("fileRef", `${fileRef} is not in the File Index. Open the file first under Files.`);
      fileId = f?.id ?? null;
    }
    p.throwIfAny();

    const beforeUnit = effectiveUnitId(row, ref);
    const set = {
      unitOverrideId: unitId,
      fileId,
      actionRequired: action,
      priority,
      actionOfficer: t(input.actionOfficer),
      responseDueOverride: due,
      routedByUserId: actor.id,
      routedAt: new Date(),
      updatedAt: new Date(),
    };
    await tx.update(inwardItems).set(set).where(eq(inwardItems.id, id));
    const unit = ref.unit(unitId ?? ref.type(row.correspondenceTypeId)?.defaultUnitId);
    await audit(
      tx,
      actor,
      row,
      "Routed",
      `${row.routedAt ? "Re-routed" : "Routed"} to ${unit?.name ?? "no unit"}; ${action}; priority ${priority}${set.actionOfficer ? `; officer ${set.actionOfficer}` : ""}${fileRef ? `; file ${fileRef}` : ""}${due ? `; response due ${due}` : ""}`,
      { before: { unitId: beforeUnit, actionRequired: row.actionRequired, priority: row.priority, fileId: row.fileId }, after: { unitId: unit?.id ?? null, actionRequired: action, priority, fileId } },
    );
    return unit?.id !== beforeUnit || !row.routedAt ? queueItemEmail(tx, actor, id, "routing") : { warnings: [], emailIds: [] };
  });
  const problems = await deliverQueued(db, r.emailIds, auditActor(actor));
  return { warnings: [...problems, ...r.warnings] };
}

/** Forward (Registry officer; ForwardToday). Warns when the item is not routed yet. */
export async function forwardInward(db: Db, actor: Actor | null, id: string, input: { date?: string | null; unitOfficer?: string | null }, opts: { confirm?: boolean } = {}): Promise<void> {
  authorize(actor, "inward:forward");
  await db.transaction(async (tx) => {
    const row = await lockInward(tx, id);
    const today = lagosToday();
    const date = t(input.date) ?? today;
    const p = new Problems();
    if (!isLocalDate(date)) p.field("date", "Date forwarded must be a date (YYYY-MM-DD).");
    else if (date > today) p.field("date", "Date forwarded cannot be in the future.");
    else if (date < row.deemedReceiptDate) p.field("date", "Date forwarded cannot be before the deemed receipt date.");
    p.throwIfAny();
    if (row.forwardedOn) throw blocked(`${row.ackNo} was already forwarded on ${row.forwardedOn}. Change the date with Update item if it is wrong.`);
    if (!row.routedAt && !opts.confirm) throw needsConfirmation(`${row.ackNo} has not been routed yet. Forward it anyway?`);
    const officer = t(input.unitOfficer);
    await tx.update(inwardItems).set({ forwardedOn: date, unitOfficerReceivedBy: officer ?? row.unitOfficerReceivedBy, updatedAt: new Date() }).where(eq(inwardItems.id, id));
    await audit(tx, actor, row, "Forwarded", `Forwarded on ${date}${officer ? ` to ${officer}` : ""}${row.routedAt ? "" : " (not routed)"}`);
  });
}

function isUnitOfficerFor(actor: Actor, unitId: string | null): boolean {
  return actor.roles.includes("unit_officer") && !!actor.unitId && actor.unitId === unitId;
}

/** Confirm receipt (Unit officer of the routed unit; Q17). */
export async function confirmReceipt(db: Db, actor: Actor | null, id: string): Promise<void> {
  authorize(actor, "inward:confirm-receipt");
  await db.transaction(async (tx) => {
    const row = await lockInward(tx, id);
    const ref = await loadRegistryRef(tx);
    const unitId = effectiveUnitId(row, ref);
    if (!isUnitOfficerFor(actor, unitId)) throw forbidden(`Only a unit officer of ${ref.unit(unitId)?.name ?? "the routed unit"} can confirm receipt.`);
    if (row.unitReceivedAt) throw blocked(`Receipt was already confirmed by ${row.unitOfficerReceivedBy ?? "the unit"}.`);
    await tx
      .update(inwardItems)
      .set({ unitOfficerReceivedBy: actor.name, unitReceivedByUserId: actor.id, unitReceivedAt: new Date(), forwardedOn: row.forwardedOn ?? lagosToday(), updatedAt: new Date() })
      .where(eq(inwardItems.id, id));
    await audit(tx, actor, row, "Receipt confirmed", `Received by ${actor.name} for ${ref.unit(unitId)?.name ?? "the unit"}`);
  });
}

/** Close (Registry officer, or a unit officer of the routed unit; CloseToday). */
export async function closeInward(db: Db, actor: Actor | null, id: string, opts: { confirm?: boolean } = {}): Promise<LocalDate> {
  authorize(actor, "inward:close");
  return db.transaction(async (tx) => {
    const row = await lockInward(tx, id);
    const ref = await loadRegistryRef(tx);
    const unitId = effectiveUnitId(row, ref);
    if (!can(actor, "inward:write") && !isUnitOfficerFor(actor, unitId)) {
      throw forbidden(`Only a Registry officer or a unit officer of ${ref.unit(unitId)?.name ?? "the routed unit"} can close this item.`);
    }
    if (row.closedManualOn) throw blocked(`${row.ackNo} was already closed on ${row.closedManualOn}.`);
    const [reply] = await tx
      .select({ outNo: outwardItems.outNo, dispatchedOn: outwardItems.dispatchedOn })
      .from(outwardItems)
      .where(and(eq(outwardItems.inReplyToInwardId, id)));
    if (reply?.dispatchedOn) throw blocked(`${row.ackNo} is already closed by the reply ${reply.outNo}, dispatched ${reply.dispatchedOn}.`);
    if (!opts.confirm) throw needsConfirmation(`Close ${row.ackNo} without an outgoing letter?`);
    const today = lagosToday();
    await tx.update(inwardItems).set({ closedManualOn: today, forwardedOn: row.forwardedOn ?? today, updatedAt: new Date() }).where(eq(inwardItems.id, id));
    await audit(tx, actor, row, "Closed", `Closed on ${today} without an outgoing letter`);
    return today;
  });
}
