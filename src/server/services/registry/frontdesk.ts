/**
 * Front desk (SPEC §17; RegistryDesk.SaveFrontDesk). Logs what is handed in
 * and issues the FD number. No acknowledgement: the Registry registers the
 * item later on New Inward or Registry Intake.
 */
import { eq } from "drizzle-orm";
import { lagosDate, yearOf } from "@/domain/dates";
import { auditActor, authorize, type Actor } from "../../auth/actor";
import { writeAudit } from "../../audit";
import type { Db, Tx } from "../../db/connect";
import { frontDeskItems } from "../../db/schema";
import { blocked, notFound, Problems } from "../../errors";
import { issueNumber } from "../../numbering";
import { inList, optionalCount, optionalPhone, receivedInstant, t } from "./common";
import { loadRegistryRef } from "./ref";

export type FrontDeskInput = {
  receivedDate: string;
  receivedTime: string;
  sender: string;
  subject: string;
  correspondenceTypeId?: string | null;
  mode?: string | null;
  deliveredBy?: string | null;
  phone?: string | null;
  volumes?: number | null;
  remarks?: string | null;
};

export async function logFrontDesk(db: Db, actor: Actor | null, input: FrontDeskInput): Promise<{ id: string; fdNo: string }> {
  authorize(actor, "frontdesk:log");
  return db.transaction(async (tx) => {
    const ref = await loadRegistryRef(tx);
    const p = new Problems();
    const receivedAt = receivedInstant(p, input.receivedDate, input.receivedTime);
    const sender = t(input.sender);
    if (!sender) p.field("sender", "Sender is required.");
    const subject = t(input.subject);
    if (!subject) p.field("subject", "Subject is required.");
    const typeId = t(input.correspondenceTypeId);
    if (typeId && !ref.type(typeId)) p.field("correspondenceTypeId", "Choose the type from the list.");
    const mode = inList(p, "mode", input.mode || "Hand delivery", ref.modes, "Mode of receipt");
    const phone = optionalPhone(p, input.phone);
    const volumes = optionalCount(p, "volumes", input.volumes, "Number of items");
    p.throwIfAny();

    const { number } = await issueNumber(tx, "FD", { year: yearOf(lagosDate(receivedAt!)) });
    const [row] = await tx
      .insert(frontDeskItems)
      .values({
        fdNo: number,
        fdYear: yearOf(lagosDate(receivedAt!)),
        receivedAt: receivedAt!,
        sender: sender!,
        subject: subject!,
        correspondenceTypeId: typeId,
        mode: mode!,
        deliveredBy: t(input.deliveredBy),
        phone,
        volumes,
        receivedByUserId: actor.id,
        receivedByName: actor.name,
        remarks: t(input.remarks),
      })
      .returning({ id: frontDeskItems.id });
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Front desk logged",
      module: "registry",
      entityType: "front_desk_item",
      entityId: row.id,
      reference: number,
      detail: `${sender} - ${subject}${mode ? ` - ${mode}` : ""}`,
    });
    return { id: row.id, fdNo: number };
  });
}

/** Locks an FD item for registration and returns it; refuses one already registered (SPEC §17). */
export async function takeFrontDeskItem(tx: Tx, id: string) {
  const [fd] = await tx.select().from(frontDeskItems).where(eq(frontDeskItems.id, id)).for("update");
  if (!fd) throw notFound("Front desk item");
  if (fd.inwardItemId) throw blocked(`${fd.fdNo} is already registered. A front desk item can be registered once only.`);
  return fd;
}

export async function markFrontDeskRegistered(tx: Tx, actor: Actor, fd: { id: string; fdNo: string }, inward: { id: string; ackNo: string }) {
  await tx.update(frontDeskItems).set({ inwardItemId: inward.id, registeredAt: new Date() }).where(eq(frontDeskItems.id, fd.id));
  await writeAudit(tx, {
    actor: auditActor(actor),
    action: "Front desk registered",
    module: "registry",
    entityType: "front_desk_item",
    entityId: fd.id,
    reference: fd.fdNo,
    detail: `Registered as ${inward.ackNo}`,
  });
}
