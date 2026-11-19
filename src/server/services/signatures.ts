/**
 * Staff e-signatures. An admin uploads each person's signature once on their staff account;
 * the PDFs then stamp it where that person signs (letters.ts decides when). Kept as private
 * PNGs in Vercel Blob; every change is audited.
 */
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { signaturePathname, signatureProblem } from "@/domain/signatures";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import { blobEnabled, signatureBlobStore, type SignatureStore } from "../blob";
import type { Db, DbOrTx } from "../db/connect";
import { users } from "../db/schema";
import { blocked, notFound, Problems } from "../errors";

export async function saveSignature(db: Db, actor: Actor | null, userId: string, bytes: Uint8Array, store: SignatureStore = signatureBlobStore): Promise<void> {
  authorize(actor, "users:manage");
  const problem = signatureProblem(bytes);
  if (problem) {
    const p = new Problems();
    p.field("signature", problem);
    p.throwIfAny();
  }
  const [u] = await db.select({ id: users.id, removedAt: users.removedAt }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("User");
  if (u.removedAt) throw blocked("This account was deleted.");
  if (store === signatureBlobStore && !blobEnabled()) throw blocked("File storage is not set up (connect a private Blob store in Vercel).");

  const pathname = signaturePathname(userId, randomBytes(8).toString("hex"));
  await store.save(pathname, bytes);
  const old = await db.transaction(async (tx) => {
    const [before] = await tx.select({ name: users.name, path: users.signaturePath }).from(users).where(eq(users.id, userId)).for("update");
    await tx.update(users).set({ signaturePath: pathname, signatureUpdatedAt: new Date() }).where(eq(users.id, userId));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: before.path ? "Signature replaced" : "Signature added",
      module: "admin",
      entityType: "user",
      entityId: userId,
      detail: `E-signature for ${before.name} (${Math.round(bytes.length / 1024)} KB PNG)`,
    });
    return before.path;
  });
  if (old) await store.remove([old]);
}

export async function removeSignature(db: Db, actor: Actor | null, userId: string, store: SignatureStore = signatureBlobStore): Promise<void> {
  authorize(actor, "users:manage");
  const old = await db.transaction(async (tx) => {
    const [u] = await tx.select({ name: users.name, path: users.signaturePath }).from(users).where(eq(users.id, userId)).for("update");
    if (!u) throw notFound("User");
    if (!u.path) return null;
    await tx.update(users).set({ signaturePath: null, signatureUpdatedAt: new Date() }).where(eq(users.id, userId));
    await writeAudit(tx, { actor: auditActor(actor), action: "Signature removed", module: "admin", entityType: "user", entityId: userId, detail: `E-signature for ${u.name}` });
    return u.path;
  });
  if (old) await store.remove([old]);
}

/** The signature images of the given people, for a PDF. Anyone without one is left out. */
export async function signaturesOf(db: DbOrTx, ids: (string | null | undefined)[], store: SignatureStore = signatureBlobStore): Promise<Map<string, Buffer>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, Buffer>();
  if (!wanted.length) return out;
  const rows = await db.select({ id: users.id, path: users.signaturePath, removedAt: users.removedAt }).from(users).where(inArray(users.id, wanted));
  await Promise.all(
    rows
      .filter((r) => r.path && !r.removedAt)
      .map(async (r) => {
        const img = await store.read(r.path!);
        if (img) out.set(r.id, img);
      }),
  );
  return out;
}

/** The current signature image of one person, for the admin preview. */
export async function signatureImage(db: DbOrTx, actor: Actor | null, userId: string, store: SignatureStore = signatureBlobStore): Promise<Buffer | null> {
  authorize(actor, "users:manage");
  return (await signaturesOf(db, [userId], store)).get(userId) ?? null;
}
