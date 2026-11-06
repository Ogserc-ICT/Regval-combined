/**
 * Acknowledgement and routing emails (SPEC §25, [G9]).
 *
 * Inside the save's transaction an email is *queued* (mode Send) or kept as a
 * *preview* (mode Preview, for the officer to review and send). After the
 * transaction commits, queued emails are delivered: the slip PDF is rendered,
 * kept in Vercel Blob (private) and attached. A failure is recorded on the
 * message and the item history; it never undoes the save.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { lagosDateTime, longDate } from "@/domain/dates";
import { unitRecipients } from "@/domain/registry";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { SYSTEM_ACTOR, writeAudit, type AuditActor } from "../audit";
import { keepFile } from "../blob";
import type { Db, DbOrTx, Tx } from "../db/connect";
import { emailMessages, inwardItems, users } from "../db/schema";
import { emailTransport } from "../email/transport";
import { blocked, needsConfirmation, notFound } from "../errors";
import { renderSlip, slipFileName } from "../pdf/slip";
import { loadInward, registryCtx } from "./registry/load";
import { getSettings } from "./settings";

export type EmailKind = "acknowledgement" | "routing";
export type Queued = { warnings: string[]; emailIds: string[] };

const splitAddresses = (cell: string | null | undefined) =>
  (cell ?? "")
    .split(/[;,]/)
    .map((a) => a.trim())
    .filter(Boolean);

async function emailedAddresses(db: DbOrTx, inwardId: string): Promise<Set<string>> {
  const rows = await db
    .select({ to: emailMessages.to })
    .from(emailMessages)
    .where(and(eq(emailMessages.entityType, "inward_item"), eq(emailMessages.entityId, inwardId), inArray(emailMessages.status, ["sent", "queued"])));
  return new Set(rows.flatMap((r) => r.to.map((a) => a.toLowerCase())));
}

/** Subject and body (SPEC §25). */
async function compose(tx: DbOrTx, inwardId: string, kind: EmailKind) {
  const ctx = await registryCtx(tx);
  const v = await loadInward(tx, inwardId, ctx);
  const r = v.row;
  const lines = [
    `Acknowledgement no.: ${r.ackNo}`,
    `Type: ${v.typeName ?? "-"}`,
    `From: ${r.sender}${r.senderCategory ? ` (${r.senderCategory})` : ""}`,
    `Subject: ${r.subject}`,
    r.senderRef ? `Sender's ref.: ${r.senderRef}` : null,
    `Received: ${lagosDateTime(r.receivedAt)} by ${r.mode}`,
    `Deemed received: ${longDate(r.deemedReceiptDate)}`,
    `Received by: ${v.receivedByName ?? "-"}`,
    `Unit: ${v.unit?.name ?? "-"}`,
    `Division: ${v.unit?.divisionName ?? "-"}`,
  ];
  let subject: string;
  if (kind === "routing") {
    const [router] = r.routedByUserId ? await tx.select({ name: users.name }).from(users).where(eq(users.id, r.routedByUserId)) : [];
    subject = `Routed to ${v.unit?.name ?? "unit"}: ${r.ackNo} - ${r.sender}`;
    lines.push(
      "",
      `Routed by: ${router?.name ?? "-"}${r.routedAt ? ` on ${lagosDateTime(r.routedAt)}` : ""}`,
      `Action required: ${r.actionRequired ?? "-"}`,
      `Priority: ${r.priority ?? "Normal"}`,
      `Action officer: ${r.actionOfficer ?? "-"}`,
      `Response due: ${v.a.responseDue ? longDate(v.a.responseDue) : "none"}`,
      `File reference: ${v.fileRef ?? "-"}`,
    );
  } else {
    subject = `Acknowledgement ${r.ackNo} - ${v.typeName ?? "correspondence"} from ${r.sender}`;
    lines.push("", "Routing, file reference and handling will follow from the Secretary to the Commission / Head of Administration.");
  }
  lines.push("", "OGSERC Registry");
  return { subject, body: lines.filter((l) => l !== null).join("\n"), unit: v.unit, ackNo: r.ackNo };
}

/**
 * Queues the acknowledgement or routing email for an inward item, in the
 * caller's transaction. Returns warnings for the officer (no address,
 * preview waiting) and the ids to deliver after commit.
 */
export async function queueItemEmail(tx: Tx, actor: Actor, inwardId: string, kind: EmailKind): Promise<Queued> {
  const settings = await getSettings(tx);
  if (settings.ackEmailMode === "Off") return { warnings: [], emailIds: [] };
  const c = await compose(tx, inwardId, kind);
  const what = kind === "routing" ? "Routing" : "Acknowledgement";
  const to = unitRecipients(c.unit?.email, c.unit?.divisionEmail);
  if (!to.length) {
    const unitName = c.unit?.name ?? "none";
    const divisionName = c.unit?.divisionName ?? "none";
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Not emailed: no address",
      module: "registry",
      entityType: "inward_item",
      entityId: inwardId,
      reference: c.ackNo,
      detail: `${what} email not sent: no address for unit ${unitName}, division ${divisionName}`,
    });
    return { warnings: [`${what} not emailed: unit ${unitName} and division ${divisionName} have no email address. Ask an admin to add one.`], emailIds: [] };
  }
  if (kind === "routing") {
    const done = await emailedAddresses(tx, inwardId);
    if (to.every((a) => done.has(a.toLowerCase()))) return { warnings: [], emailIds: [] };
  }
  const status = settings.ackEmailMode === "Send" ? "queued" : "preview";
  const [m] = await tx
    .insert(emailMessages)
    .values({
      kind,
      entityType: "inward_item",
      entityId: inwardId,
      reference: c.ackNo,
      to,
      cc: splitAddresses(settings.ackEmailCc),
      subject: c.subject,
      body: c.body,
      attachSlip: kind === "acknowledgement" ? 1 : 0,
      status,
      createdBy: actor.id,
      createdByName: actor.name,
    })
    .returning({ id: emailMessages.id });
  return status === "queued"
    ? { warnings: [], emailIds: [m.id] }
    : { warnings: [`${what} email to ${to.join(", ")} is ready for review: send it from the item page.`], emailIds: [] };
}

/** Delivers queued messages after commit. Never throws: failures are recorded. */
export async function deliverQueued(db: Db, ids: string[], by: AuditActor = SYSTEM_ACTOR): Promise<string[]> {
  const problems: string[] = [];
  for (const id of ids) {
    const p = await deliver(db, id, by);
    if (p) problems.push(p);
  }
  return problems;
}

async function deliver(db: Db, id: string, by: AuditActor): Promise<string | null> {
  const [m] = await db.select().from(emailMessages).where(eq(emailMessages.id, id));
  if (!m || (m.status !== "queued" && m.status !== "preview")) return null;
  const transport = emailTransport();
  const what = m.kind === "routing" ? "Routing" : "Acknowledgement";
  try {
    let attachments: { filename: string; content: Buffer }[] = [];
    let blobPathname: string | null = null;
    if (m.attachSlip) {
      const slip = await renderSlip(db, m.entityId);
      const filename = slipFileName(slip.ackNo);
      attachments = [{ filename, content: slip.buffer }];
      blobPathname = await keepFile(`slips/${filename}`, slip.buffer, "application/pdf");
    }
    const res = await transport.send({ to: m.to, cc: m.cc, subject: m.subject, text: m.body, attachments });
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(emailMessages)
        .set({ status: "sent", provider: transport.name, providerMessageId: res.id, blobPathname, sentAt: now, sentByName: by.name, error: null })
        .where(eq(emailMessages.id, id));
      if (m.kind === "acknowledgement") {
        await tx.update(inwardItems).set({ ackEmailedTo: m.to.join("; "), ackEmailedAt: now }).where(eq(inwardItems.id, m.entityId));
      }
      await writeAudit(tx, {
        actor: by,
        action: `${what} emailed`,
        module: "registry",
        entityType: m.entityType,
        entityId: m.entityId,
        reference: m.reference,
        detail: `To ${m.to.join(", ")}${m.cc.length ? `; cc ${m.cc.join(", ")}` : ""}; ${m.subject}`,
      });
    });
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.transaction(async (tx) => {
      await tx.update(emailMessages).set({ status: "failed", provider: transport.name, error: msg }).where(eq(emailMessages.id, id));
      await writeAudit(tx, {
        actor: by,
        action: "Email failed",
        module: "registry",
        entityType: m.entityType,
        entityId: m.entityId,
        reference: m.reference,
        detail: `${what} email to ${m.to.join(", ")} failed: ${msg}`,
      });
    });
    return `${what} email failed: ${msg}`;
  }
}

/** Sends a previewed (or failed) message now. */
export async function sendEmailNow(db: Db, actor: Actor | null, messageId: string): Promise<string | null> {
  authorize(actor, "inward:write");
  const [m] = await db.select().from(emailMessages).where(eq(emailMessages.id, messageId));
  if (!m) throw notFound("Email");
  if (m.status === "failed") await db.update(emailMessages).set({ status: "queued" }).where(eq(emailMessages.id, messageId));
  else if (m.status !== "preview") throw blocked(`This email is already ${m.status}.`);
  return deliver(db, messageId, auditActor(actor));
}

export async function discardEmail(db: Db, actor: Actor | null, messageId: string): Promise<void> {
  authorize(actor, "inward:write");
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(emailMessages).where(eq(emailMessages.id, messageId)).for("update");
    if (!m) throw notFound("Email");
    if (m.status !== "preview" && m.status !== "failed") throw blocked(`This email is already ${m.status}.`);
    await tx.update(emailMessages).set({ status: "discarded" }).where(eq(emailMessages.id, messageId));
    await writeAudit(tx, { actor: auditActor(actor), action: "Email discarded", module: "registry", entityType: m.entityType, entityId: m.entityId, reference: m.reference, detail: m.subject });
  });
}

/** Resend the acknowledgement (Registry officer). Asks to confirm when it was emailed before. */
export async function resendAcknowledgement(db: Db, actor: Actor | null, inwardId: string, opts: { confirm?: boolean } = {}): Promise<string> {
  authorize(actor, "inward:write");
  const settings = await getSettings(db);
  if (settings.ackEmailMode === "Off") throw blocked("Acknowledgement emails are switched off (Admin › Settings).");
  const ids = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(inwardItems).where(eq(inwardItems.id, inwardId)).for("update");
    if (!row) throw notFound("Inward item");
    if (row.ackEmailedAt && !opts.confirm) throw needsConfirmation(`${row.ackNo} was emailed on ${lagosDateTime(row.ackEmailedAt)} to ${row.ackEmailedTo}. Send it again?`);
    const c = await compose(tx, inwardId, "acknowledgement");
    const to = unitRecipients(c.unit?.email, c.unit?.divisionEmail);
    if (!to.length) throw blocked(`No address: unit ${c.unit?.name ?? "none"} and division ${c.unit?.divisionName ?? "none"} have no email address.`);
    const [m] = await tx
      .insert(emailMessages)
      .values({ kind: "acknowledgement", entityType: "inward_item", entityId: inwardId, reference: c.ackNo, to, cc: splitAddresses(settings.ackEmailCc), subject: c.subject, body: c.body, attachSlip: 1, status: "queued", createdBy: actor.id, createdByName: actor.name })
      .returning({ id: emailMessages.id });
    return [m.id];
  });
  const problems = await deliverQueued(db, ids, auditActor(actor));
  if (problems.length) throw blocked(...problems);
  return "Acknowledgement emailed.";
}

export async function emailsFor(db: DbOrTx, entityType: string, entityId: string) {
  return db.select().from(emailMessages).where(and(eq(emailMessages.entityType, entityType), eq(emailMessages.entityId, entityId))).orderBy(desc(emailMessages.createdAt));
}
