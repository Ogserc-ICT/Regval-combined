/**
 * Registry reads: every register row with its calculated columns (SPEC §17–§23).
 * Calculated values are never stored; each list is assessed with a fixed
 * number of queries.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { lagosDate, type LocalDate } from "@/domain/dates";
import {
  assessFile,
  assessInward,
  assessOutward,
  frontDeskWaiting,
  movementReturnDue,
  movementStatus,
  registerEntryState,
  type EntryState,
  type FileAssessment,
  type InwardAssessment,
  type MovementStatus,
  type OutwardAssessment,
} from "@/domain/registry";
import { registrationDeadline, type Settings } from "@/domain/settings";
import type { HolidaySet } from "@/domain/workdays";
import { all, type DbOrTx } from "../../db/connect";
import { fileMovements, files, frontDeskItems, inwardItems, outwardItems, ownUseNotifications, submissions, users } from "../../db/schema";
import { notFound } from "../../errors";
import { lagosToday } from "../../time";
import { getHolidaySet } from "../holidays";
import { getSettings } from "../settings";
import { effectiveUnitId, inwardType, loadRegistryRef, outwardDocType, type RegistryRef, type UnitInfo } from "./ref";

export type RegistryCtx = { settings: Settings; holidays: HolidaySet; today: LocalDate; ref: RegistryRef };

export async function registryCtx(db: DbOrTx): Promise<RegistryCtx> {
  const [settings, holidays, ref] = await all(db, [() => getSettings(db), () => getHolidaySet(db), () => loadRegistryRef(db)]);
  return { settings, holidays, today: lagosToday(), ref };
}

const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);

// ------------------------------------------------------------------ inward

export type InwardRow = typeof inwardItems.$inferSelect;
export type InwardView = {
  row: InwardRow;
  typeName: string | null;
  unit: UnitInfo | null;
  a: InwardAssessment;
  entry: EntryState;
  entryHref: string | null;
  reply: { id: string; outNo: string; dispatchedOn: LocalDate | null } | null;
  fdNo: string | null;
  fileRef: string | null;
  inResponseToOutNo: string | null;
  receivedByName: string | null;
};

export async function inwardViews(db: DbOrTx, rows: InwardRow[], ctx?: RegistryCtx): Promise<InwardView[]> {
  const c = ctx ?? (await registryCtx(db));
  if (!rows.length) return [];
  const idList = ids(rows);
  const [replies, subs, ous, fds, fileRows, outRefs, people, regCacs, docCounts] = await all(db, [
    () =>
      db
        .select({ id: outwardItems.id, outNo: outwardItems.outNo, dispatchedOn: outwardItems.dispatchedOn, inReplyTo: outwardItems.inReplyToInwardId })
        .from(outwardItems)
        .where(inArray(outwardItems.inReplyToInwardId, idList))
        .orderBy(asc(outwardItems.dispatchedOn), asc(outwardItems.outNo)),
    () => db.select({ id: submissions.id, inward: submissions.inwardItemId, status: submissions.status, form: submissions.formFiled }).from(submissions).where(inArray(submissions.inwardItemId, idList)),
    () => db.select({ id: ownUseNotifications.id, inward: ownUseNotifications.inwardItemId, oun: ownUseNotifications.ounNo }).from(ownUseNotifications).where(inArray(ownUseNotifications.inwardItemId, idList)),
    () => db.select({ id: frontDeskItems.id, fdNo: frontDeskItems.fdNo }).from(frontDeskItems).where(inArray(frontDeskItems.inwardItemId, idList)),
    () => db.select({ id: files.id, ref: files.fileRef }).from(files),
    () => db.select({ id: outwardItems.id, outNo: outwardItems.outNo }).from(outwardItems).where(inArray(outwardItems.id, rows.map((r) => r.inResponseToOutwardId).filter((x): x is string => !!x).concat(["00000000-0000-0000-0000-000000000000"]))),
    () => db.select({ id: users.id, name: users.name }).from(users),
    // CACs filed more than once on REG-01 (possible duplicate)
    () =>
      db.execute<{ cac: string }>(sql`
        select lower(trim(i.cac_no)) as cac from inward_items i
        join correspondence_types t on t.id = i.correspondence_type_id and t.filing_type = 'NEW'
        where i.cac_no is not null and trim(i.cac_no) <> ''
        group by 1 having count(*) > 1`),
    () => db.execute<{ form: string; n: number }>(sql`select form, count(*)::int as n from form_documents group by form`),
  ]);
  const docsFor = (form: string | null | undefined) => (form ? (docCounts.rows.find((d) => d.form === form)?.n ?? null) : null);
  const dupCacs = new Set(regCacs.rows.map((r) => r.cac));
  const deadline = registrationDeadline(c.settings);
  return rows.map((row) => {
    const t = c.ref.type(row.correspondenceTypeId);
    const sub = subs.find((x) => x.inward === row.id);
    const ou = ous.find((o) => o.inward === row.id);
    const reply = replies.find((r) => r.inReplyTo === row.id && r.dispatchedOn) ?? replies.find((r) => r.inReplyTo === row.id) ?? null;
    const a = assessInward(
      {
        deemedReceiptDate: row.deemedReceiptDate,
        type: inwardType(t),
        sender: row.sender,
        senderCategory: row.senderCategory,
        subject: row.subject,
        mode: row.mode,
        relatedOgsercNo: row.relatedOgsercNo,
        cacNo: row.cacNo,
        schedule2Count: row.schedule2Count,
        schedule2Expected: sub ? docsFor(sub.form) : ou ? docsFor("REG-01I") : null,
        feeEvidence: row.feeEvidence,
        ackIssuedVia: row.ackIssuedVia,
        actionRequired: row.actionRequired,
        priority: row.priority,
        responseDueOverride: row.responseDueOverride,
        routedAt: row.routedAt,
        forwardedOn: row.forwardedOn,
        closedManualOn: row.closedManualOn,
        replyDispatchedOn: reply?.dispatchedOn ?? null,
      },
      {
        settings: c.settings,
        holidays: c.holidays,
        today: c.today,
        registrationDeadline: deadline,
        duplicateRegCac: !!row.cacNo && dupCacs.has(row.cacNo.trim().toLowerCase()),
      },
    );
    const entry = registerEntryState(
      inwardType(t),
      sub ? { kind: "submission", saved: !!sub.status } : ou ? { kind: "own_use", saved: !!ou.oun } : null,
    );
    return {
      row,
      typeName: t?.name ?? null,
      unit: c.ref.unit(effectiveUnitId(row, c.ref)),
      a,
      entry,
      entryHref: sub ? `/register/${sub.id}` : ou ? `/own-use/${ou.id}` : null,
      reply: reply ? { id: reply.id, outNo: reply.outNo, dispatchedOn: reply.dispatchedOn } : null,
      fdNo: fds.find((f) => f.id === row.frontDeskItemId)?.fdNo ?? null,
      fileRef: fileRows.find((f) => f.id === row.fileId)?.ref ?? null,
      inResponseToOutNo: outRefs.find((o) => o.id === row.inResponseToOutwardId)?.outNo ?? null,
      receivedByName: people.find((p) => p.id === row.receivedByUserId)?.name ?? row.receivedByPlaceholder ?? null,
    };
  });
}

export async function listInward(db: DbOrTx, ctx?: RegistryCtx): Promise<InwardView[]> {
  const rows = await db.select().from(inwardItems).orderBy(desc(inwardItems.ackYear), desc(inwardItems.ackNo));
  return inwardViews(db, rows, ctx);
}

export async function loadInward(db: DbOrTx, id: string, ctx?: RegistryCtx): Promise<InwardView> {
  const [row] = await db.select().from(inwardItems).where(eq(inwardItems.id, id));
  if (!row) throw notFound("Inward item");
  return (await inwardViews(db, [row], ctx))[0];
}

/** Pending actions (SPEC §23): Open, Overdue, Awaiting forwarding or routing, in the order received. */
export async function pendingActions(db: DbOrTx, unitId?: string | null, ctx?: RegistryCtx) {
  const list = (await listInward(db, ctx)).filter((v) => ["Open", "Overdue", "Awaiting forwarding", "Awaiting routing"].includes(v.a.status));
  const shown = unitId ? list.filter((v) => v.unit?.id === unitId) : list;
  shown.sort((a, b) => a.row.receivedAt.getTime() - b.row.receivedAt.getTime());
  return {
    items: shown,
    totals: {
      pending: shown.length,
      overdue: shown.filter((v) => v.a.status === "Overdue").length,
      awaitingRouting: shown.filter((v) => v.a.status === "Awaiting routing").length,
      awaitingForwarding: shown.filter((v) => v.a.status === "Awaiting forwarding").length,
    },
  };
}

// ------------------------------------------------------------------ front desk

export type FrontDeskRow = typeof frontDeskItems.$inferSelect;

export async function listFrontDesk(db: DbOrTx, opts: { awaitingOnly?: boolean } = {}, ctx?: RegistryCtx) {
  const c = ctx ?? (await registryCtx(db));
  const rows = await db
    .select({ fd: frontDeskItems, ackNo: inwardItems.ackNo })
    .from(frontDeskItems)
    .leftJoin(inwardItems, eq(inwardItems.id, frontDeskItems.inwardItemId))
    .where(opts.awaitingOnly ? isNull(frontDeskItems.inwardItemId) : undefined)
    .orderBy(opts.awaitingOnly ? asc(frontDeskItems.receivedAt) : desc(frontDeskItems.receivedAt));
  return rows.map(({ fd, ackNo }) => ({
    row: fd,
    ackNo,
    status: fd.inwardItemId ? ("Registered" as const) : ("Awaiting registry" as const),
    typeName: c.ref.type(fd.correspondenceTypeId)?.name ?? null,
    waiting: fd.inwardItemId ? null : frontDeskWaiting(fd.receivedAt, c.today, c.holidays),
  }));
}

/** Inward filings acknowledged on New Inward whose Register / Own-Use entry is not saved (SPEC §18.2). */
export async function awaitingRegisterEntry(db: DbOrTx, ctx?: RegistryCtx) {
  const c = ctx ?? (await registryCtx(db));
  const filingTypeIds = c.ref.types.filter((t) => t.filingType).map((t) => t.id);
  if (!filingTypeIds.length) return [];
  const rows = await db
    .select()
    .from(inwardItems)
    .where(and(inArray(inwardItems.correspondenceTypeId, filingTypeIds), eq(inwardItems.isExample, false)))
    .orderBy(asc(inwardItems.receivedAt));
  const views = await inwardViews(db, rows, c);
  return views.filter((v) => v.entry === "Awaiting Register entry" || v.entry === "Register row started – complete and save it");
}

// ------------------------------------------------------------------ outward

export type OutwardRow = typeof outwardItems.$inferSelect;
export type OutwardView = {
  row: OutwardRow;
  a: OutwardAssessment;
  unitName: string | null;
  inReplyToAck: string | null;
  inReplyToSender: string | null;
  fileRef: string | null;
  response: { id: string; ackNo: string; deemed: LocalDate } | null;
  dispatchedByName: string | null;
};

export async function outwardViews(db: DbOrTx, rows: OutwardRow[], ctx?: RegistryCtx): Promise<OutwardView[]> {
  const c = ctx ?? (await registryCtx(db));
  if (!rows.length) return [];
  const idList = ids(rows);
  const replyTo = rows.map((r) => r.inReplyToInwardId).filter((x): x is string => !!x);
  const [responses, inwards, fileRows, people] = await all(db, [
    () =>
      db
        .select({ id: inwardItems.id, ackNo: inwardItems.ackNo, deemed: inwardItems.deemedReceiptDate, out: inwardItems.inResponseToOutwardId })
        .from(inwardItems)
        .where(inArray(inwardItems.inResponseToOutwardId, idList))
        .orderBy(asc(inwardItems.deemedReceiptDate)),
    () =>
      replyTo.length
        ? db.select({ id: inwardItems.id, ackNo: inwardItems.ackNo, sender: inwardItems.sender }).from(inwardItems).where(inArray(inwardItems.id, replyTo))
        : Promise.resolve([] as { id: string; ackNo: string; sender: string }[]),
    () => db.select({ id: files.id, ref: files.fileRef }).from(files),
    () => db.select({ id: users.id, name: users.name }).from(users),
  ]);
  return rows.map((row) => {
    const response = responses.find((r) => r.out === row.id) ?? null;
    const a = assessOutward(
      {
        documentDate: row.documentDate,
        docType: outwardDocType(c.ref.outgoingType(row.documentType)),
        subject: row.subject,
        addressee: row.addressee,
        recipientCategory: row.recipientCategory,
        dispatchMode: row.dispatchMode,
        dispatchedOn: row.dispatchedOn,
        deliveryConfirmed: row.deliveryConfirmed,
        responseExpected: row.responseExpected,
        responseDueOverride: row.responseDueOverride,
        responseReceivedOn: response?.deemed ?? null,
      },
      { settings: c.settings, holidays: c.holidays, today: c.today },
    );
    const inw = inwards.find((i) => i.id === row.inReplyToInwardId);
    return {
      row,
      a,
      unitName: c.ref.unit(row.originatingUnitId)?.name ?? null,
      inReplyToAck: inw?.ackNo ?? null,
      inReplyToSender: inw?.sender ?? null,
      fileRef: fileRows.find((f) => f.id === row.fileId)?.ref ?? null,
      response: response ? { id: response.id, ackNo: response.ackNo, deemed: response.deemed } : null,
      dispatchedByName: people.find((p) => p.id === row.dispatchedByUserId)?.name ?? null,
    };
  });
}

export async function listOutward(db: DbOrTx, ctx?: RegistryCtx) {
  const rows = await db.select().from(outwardItems).orderBy(desc(outwardItems.outYear), desc(outwardItems.outNo));
  return outwardViews(db, rows, ctx);
}

export async function loadOutward(db: DbOrTx, id: string, ctx?: RegistryCtx) {
  const [row] = await db.select().from(outwardItems).where(eq(outwardItems.id, id));
  if (!row) throw notFound("Outward item");
  return (await outwardViews(db, [row], ctx))[0];
}

// ------------------------------------------------------------------ files

export type FileRow = typeof files.$inferSelect;
export type MovementRow = typeof fileMovements.$inferSelect;
export type MovementView = { row: MovementRow; unitName: string | null; returnDue: LocalDate; status: MovementStatus; fileRef: string; fileTitle: string };
export type FileView = {
  row: FileRow;
  a: FileAssessment;
  owningUnit: string | null;
  inwardCount: number;
  outwardCount: number;
  movements: MovementView[];
};

export async function fileViews(db: DbOrTx, rows: FileRow[], ctx?: RegistryCtx): Promise<FileView[]> {
  const c = ctx ?? (await registryCtx(db));
  if (!rows.length) return [];
  const idList = ids(rows);
  const [moves, inw, outw] = await all(db, [
    () => db.select().from(fileMovements).where(inArray(fileMovements.fileId, idList)).orderBy(desc(fileMovements.outAt)),
    () => db.select({ fileId: inwardItems.fileId, d: inwardItems.deemedReceiptDate }).from(inwardItems).where(inArray(inwardItems.fileId, idList)),
    () => db.select({ fileId: outwardItems.fileId, d: outwardItems.documentDate }).from(outwardItems).where(inArray(outwardItems.fileId, idList)),
  ]);
  return rows.map((row) => {
    const mine = moves.filter((m) => m.fileId === row.id);
    const a = assessFile(
      {
        title: row.title,
        status: row.status,
        closedOn: row.closedOn,
        movements: mine.map((m) => ({ outAt: m.outAt, returnByOverride: m.returnByOverride, returnedAt: m.returnedAt, issuedTo: m.issuedTo, unitName: c.ref.unit(m.unitId)?.name ?? null })),
        correspondenceDates: [...inw.filter((i) => i.fileId === row.id).map((i) => i.d), ...outw.filter((o) => o.fileId === row.id).map((o) => o.d)],
      },
      { settings: c.settings, holidays: c.holidays, today: c.today },
    );
    return {
      row,
      a,
      owningUnit: c.ref.unit(row.owningUnitId)?.name ?? null,
      inwardCount: inw.filter((i) => i.fileId === row.id).length,
      outwardCount: outw.filter((o) => o.fileId === row.id).length,
      movements: mine.map((m) => movementView(m, row, c)),
    };
  });
}

function movementView(m: MovementRow, file: Pick<FileRow, "fileRef" | "title">, c: RegistryCtx): MovementView {
  const due = movementReturnDue(m, c.settings, c.holidays);
  return { row: m, unitName: c.ref.unit(m.unitId)?.name ?? null, returnDue: due, status: movementStatus(m, due, c.today), fileRef: file.fileRef, fileTitle: file.title };
}

export async function listFiles(db: DbOrTx, ctx?: RegistryCtx) {
  const rows = await db.select().from(files).orderBy(asc(files.fileRef));
  return fileViews(db, rows, ctx);
}

export async function loadFile(db: DbOrTx, id: string, ctx?: RegistryCtx) {
  const [row] = await db.select().from(files).where(eq(files.id, id));
  if (!row) throw notFound("File");
  return (await fileViews(db, [row], ctx))[0];
}

/** Every movement, newest first (File Movement sheet). */
export async function listMovements(db: DbOrTx, opts: { outOnly?: boolean } = {}, ctx?: RegistryCtx): Promise<MovementView[]> {
  const c = ctx ?? (await registryCtx(db));
  const rows = await db
    .select({ m: fileMovements, ref: files.fileRef, title: files.title })
    .from(fileMovements)
    .innerJoin(files, eq(files.id, fileMovements.fileId))
    .where(opts.outOnly ? isNull(fileMovements.returnedAt) : isNotNull(fileMovements.id))
    .orderBy(desc(fileMovements.outAt));
  return rows.map((r) => movementView(r.m, { fileRef: r.ref, title: r.title }, c));
}

/** For date displays: the Lagos date of an instant. */
export const dateOf = (d: Date | null | undefined) => (d ? lagosDate(d) : null);
