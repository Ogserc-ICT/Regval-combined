/**
 * Payments ledger and the Finance decisions (SPEC §11; modPayments).
 * Only Finance-confirmed payments count. Payments are never deleted: they are reversed.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { isLocalDate } from "@/domain/dates";
import { formatNaira } from "@/domain/money";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import { all, type Db, type DbOrTx, type Tx } from "../db/connect";
import { ownUseNotifications, payments, submissions } from "../db/schema";
import { blocked, forbidden, needsConfirmation, notFound, Problems } from "../errors";
import { issueNumber } from "../numbering";
import { lagosToday, serverNow } from "../time";
import { notify, submissionHref } from "./notifications";
import { listValues } from "./reference";
import { tryRelease } from "./submissions/workflow";

export type PaymentInput = {
  dateReceived: string;
  reference: string;
  purpose?: string | null;
  channel?: string | null;
  /** Kobo. */
  amount: number;
  rrr?: string | null;
};

type Owner = { type: "submission" | "own_use"; id: string; reference: string };

async function findOwner(tx: DbOrTx, reference: string): Promise<Owner | null> {
  const ref = reference.trim();
  if (!ref) return null;
  const [s] = await tx.select({ id: submissions.id, ack: submissions.ackNo, status: submissions.status }).from(submissions).where(eq(submissions.ackNo, ref));
  if (s?.status) return { type: "submission", id: s.id, reference: s.ack };
  const [o] = await tx.select({ id: ownUseNotifications.id, oun: ownUseNotifications.ounNo }).from(ownUseNotifications).where(eq(ownUseNotifications.ounNo, ref));
  if (o?.oun) return { type: "own_use", id: o.id, reference: o.oun };
  return null;
}

const pAudit = (tx: Tx, actor: Actor, p: typeof payments.$inferSelect, action: string, detail: string) =>
  writeAudit(tx, {
    actor: auditActor(actor),
    action,
    module: "registration",
    entityType: p.ownerType === "submission" ? "submission" : "own_use",
    entityId: p.ownerId,
    reference: p.reference,
    detail,
    data: { payment: p.payNo },
  });

export async function recordPayment(db: Db, actor: Actor | null, input: PaymentInput, opts: { confirmWarnings?: boolean } = {}): Promise<string> {
  authorize(actor, "payment:record");
  const today = lagosToday();
  return db.transaction(async (tx) => {
    const p = new Problems();
    const [channels, purposes] = await all(tx, [() => listValues(tx, "payment_channel"), () => listValues(tx, "payment_purpose")]);
    if (!isLocalDate(input.dateReceived)) p.field("dateReceived", "Date received is required (YYYY-MM-DD).");
    else if (input.dateReceived > today) p.field("dateReceived", "Date received cannot be in the future.");
    const owner = await findOwner(tx, input.reference);
    if (!owner) p.field("reference", "Reference must be an existing, saved Ack No. or OUN No.");
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) p.field("amount", "Amount must be more than zero.");
    if (input.channel && !channels.includes(input.channel)) p.field("channel", "Choose the channel from the list.");
    if (input.purpose && !purposes.includes(input.purpose)) p.field("purpose", "Choose the purpose from the list.");
    p.throwIfAny();
    const rrr = input.rrr?.trim() || null;
    if (rrr && !opts.confirmWarnings) {
      const [dup] = await tx.select({ no: payments.payNo }).from(payments).where(sql`lower(trim(${payments.rrr})) = ${rrr.toLowerCase()}`).limit(1);
      if (dup) throw needsConfirmation(`RRR / bank reference ${rrr} is already on ${dup.no}. Record it anyway?`);
    }
    const { number } = await issueNumber(tx, "PAY", { year: Number(input.dateReceived.slice(0, 4)) });
    const [row] = await tx
      .insert(payments)
      .values({
        payNo: number,
        dateReceived: input.dateReceived,
        ownerType: owner!.type,
        ownerId: owner!.id,
        reference: owner!.reference,
        purpose: input.purpose || null,
        channel: input.channel || null,
        amount: input.amount,
        rrr,
        recordedBy: actor.id,
        recordedByName: actor.name,
        recordedAt: serverNow(),
      })
      .returning();
    await pAudit(tx, actor, row, "Payment recorded", `${formatNaira(input.amount)} - ref ${rrr ?? "(none)"} - ${number}`);
    await notify(tx, actor, {
      kind: "payment:recorded",
      title: `Payment to confirm: ${number}`,
      body: `${formatNaira(input.amount)} for ${owner!.reference}`,
      reference: number,
      href: "/payments",
      to: { roles: ["finance"] },
    });
    return number;
  });
}

async function lockPayment(tx: Tx, id: string) {
  const [p] = await tx.select().from(payments).where(eq(payments.id, id)).for("update");
  if (!p) throw notFound("Payment");
  return p;
}

/** Confirm after checking the bank / Remita. [G8] Not by the officer who recorded it. */
export async function confirmPayment(db: Db, actor: Actor | null, id: string, input: { verifiedWithBank: boolean; remarks?: string | null }): Promise<string> {
  authorize(actor, "payment:decide");
  return db.transaction(async (tx) => {
    const p = await lockPayment(tx, id);
    if (p.recordedBy === actor.id) {
      throw forbidden("Refused: the officer who recorded a payment cannot confirm it. Ask another Finance officer.");
    }
    if (p.reversed) throw blocked("A reversed payment cannot be confirmed.");
    if (p.financeStatus !== "Pending") throw blocked(`This payment is already ${p.financeStatus}: Finance decisions are final.`);
    if (!input.verifiedWithBank) throw blocked("Not confirmed: confirming requires the bank / Remita check.");
    const remarks = input.remarks?.trim() || null;
    await tx
      .update(payments)
      .set({ financeStatus: "Confirmed", verifiedWithBank: true, decidedBy: actor.id, decidedByName: actor.name, decidedAt: serverNow(), financeRemarks: remarks })
      .where(eq(payments.id, id));
    await pAudit(tx, actor, p, "Payment confirmed", `${formatNaira(p.amount)} - ${p.payNo} - verified with bank/Remita${remarks ? `; ${remarks}` : ""}`);
    if (p.ownerType === "submission" && (await tryRelease(tx, actor, p.ownerId))) {
      return `Payment confirmed. ${p.reference} is released for evaluation.`;
    }
    return "Payment confirmed.";
  });
}

/** Reject with a reason. [G8] Not by the officer who recorded it. */
export async function rejectPayment(db: Db, actor: Actor | null, id: string, reason: string): Promise<void> {
  authorize(actor, "payment:decide");
  await db.transaction(async (tx) => {
    const p = await lockPayment(tx, id);
    if (p.recordedBy === actor.id) throw forbidden("Refused: the officer who recorded a payment cannot reject it. Ask another Finance officer.");
    if (p.financeStatus !== "Pending" || p.reversed) throw blocked("Only a pending payment can be rejected.");
    if (!reason.trim()) new Problems().field("reason", "A reason is required.").throwIfAny();
    await tx
      .update(payments)
      .set({ financeStatus: "Rejected", decidedBy: actor.id, decidedByName: actor.name, decidedAt: serverNow(), financeRemarks: reason.trim() })
      .where(eq(payments.id, id));
    await pAudit(tx, actor, p, "Payment rejected", `${formatNaira(p.amount)} - ${p.payNo}: ${reason.trim()}`);
    await notify(tx, actor, {
      kind: "payment:rejected",
      title: `Payment rejected: ${p.payNo}`,
      body: `${formatNaira(p.amount)} for ${p.reference}: ${reason.trim()}`,
      reference: p.payNo,
      href: p.ownerType === "submission" ? submissionHref(p.ownerId, "payments") : `/own-use/${p.ownerId}`,
      to: { users: [p.recordedBy] },
    });
  });
}

/** Reverse with a reason (Finance or Admin). A released submission stays released. */
export async function reversePayment(db: Db, actor: Actor | null, id: string, reason: string): Promise<void> {
  authorize(actor, "payment:reverse");
  await db.transaction(async (tx) => {
    const p = await lockPayment(tx, id);
    if (p.reversed) throw blocked("Already reversed (a reversal is final).");
    if (p.financeStatus === "Rejected") throw blocked("A rejected payment never counted, so it cannot be reversed.");
    if (!reason.trim()) new Problems().field("reason", "A reason is required.").throwIfAny();
    await tx
      .update(payments)
      .set({ reversed: true, reversedBy: actor.id, reversedByName: actor.name, reversedAt: serverNow(), reversalReason: reason.trim() })
      .where(eq(payments.id, id));
    await pAudit(tx, actor, p, "Payment reversed", `${formatNaira(p.amount)} - ${p.payNo}: ${reason.trim()}`);
  });
}

export async function listPayments(db: DbOrTx, filter: { status?: "Pending" | "Confirmed" | "Rejected"; limit?: number } = {}) {
  const q = db.select().from(payments);
  const rows = filter.status
    ? await q.where(and(eq(payments.financeStatus, filter.status), eq(payments.reversed, false))).orderBy(asc(payments.recordedAt)).limit(filter.limit ?? 500)
    : await q.orderBy(desc(payments.recordedAt)).limit(filter.limit ?? 500);
  return rows;
}
