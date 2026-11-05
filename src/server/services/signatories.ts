/**
 * Signatories ([G3]): one list for certificates and outgoing letters.
 */
import { asc, eq } from "drizzle-orm";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import type { Db, DbOrTx } from "../db/connect";
import { SIGNATORY_ROLES, signatories, type SignatoryRole } from "../db/schema";
import { notFound, Problems } from "../errors";

export const SIGNATORY_ROLE_LABELS: Record<SignatoryRole, string> = {
  chairman_ceo: "Chairman / Chief Executive Officer",
  commissioner: "Commissioner",
  secretary: "Secretary to the Commission",
  other: "Other",
};

export type SignatoryInput = { name: string; designation: string; role: string; active: boolean; confirmed: boolean; note?: string | null };

export async function listSignatories(db: DbOrTx) {
  return db.select().from(signatories).orderBy(asc(signatories.role), asc(signatories.name));
}

function check(input: SignatoryInput) {
  const p = new Problems();
  if (!input.name?.trim()) p.field("name", "Enter the signatory's full name.");
  if (input.name?.trim() === "[Name]") p.field("name", "Enter the real name, not a placeholder.");
  if (!input.designation?.trim()) p.field("designation", "Enter the designation printed under the name.");
  if (!(SIGNATORY_ROLES as readonly string[]).includes(input.role)) p.field("role", "Choose the role.");
  p.throwIfAny();
}

export async function saveSignatory(db: Db, actor: Actor | null, id: string | null, input: SignatoryInput): Promise<string> {
  authorize(actor, "signatories:manage");
  check(input);
  return db.transaction(async (tx) => {
    const values = {
      name: input.name.trim(),
      designation: input.designation.trim(),
      role: input.role as SignatoryRole,
      active: input.active,
      confirmed: input.confirmed,
      note: input.note?.trim() || null,
      updatedAt: new Date(),
    };
    let sid = id;
    let before: typeof signatories.$inferSelect | undefined;
    if (id) {
      [before] = await tx.select().from(signatories).where(eq(signatories.id, id));
      if (!before) throw notFound("Signatory");
      await tx.update(signatories).set(values).where(eq(signatories.id, id));
    } else {
      [{ id: sid }] = await tx.insert(signatories).values(values).returning({ id: signatories.id }) as [{ id: string }];
    }
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: id ? "Signatory changed" : "Signatory added",
      module: "admin",
      entityType: "signatory",
      entityId: sid,
      detail: `${values.name}, ${values.designation} (${SIGNATORY_ROLE_LABELS[values.role]})${values.active ? "" : "; inactive"}${values.confirmed ? "; confirmed" : "; unconfirmed"}`,
      data: { before: before ?? null, after: values },
    });
    return sid!;
  });
}
