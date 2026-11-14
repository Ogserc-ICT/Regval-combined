/**
 * Files kept with a submission (Q23 step 1): the operator's filed REG-01 form and scans of
 * supporting documents, so the record is complete without a shared drive. Uploading and
 * removing need documents:update; opening needs registers:read. Every upload and removal is
 * in the audit log; a removed file's row stays with who removed it and why.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { FILE_KINDS, submissionFiles, submissions, type FileKind } from "../db/schema";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import type { Db, DbOrTx } from "../db/connect";
import { blocked, notFound, Problems } from "../errors";
import { blobStore, type FileStore } from "../blob";
import { ALLOWED_FILE_TYPES, formatBytes, inSubmissionFolder, MAX_FILE_BYTES } from "@/domain/files";

export type SubmissionFile = typeof submissionFiles.$inferSelect;


async function savedSubmission(db: DbOrTx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Submission");
  const [row] = await db.select({ id: submissions.id, ackNo: submissions.ackNo, status: submissions.status }).from(submissions).where(eq(submissions.id, id));
  if (!row) throw notFound("Submission");
  if (!row.status) throw blocked("Save the submission before adding files to it.");
  return row;
}

/**
 * Called before the browser is given an upload token: checks the person may add files to this
 * submission and that the upload goes under its folder. Returns the token's limits.
 */
export async function authorizeUpload(db: DbOrTx, actor: Actor | null, submissionId: string, pathname: string) {
  authorize(actor, "documents:update");
  await savedSubmission(db, submissionId);
  if (!inSubmissionFolder(submissionId, pathname)) throw blocked("That upload path is not allowed.");
  return { allowedContentTypes: Object.keys(ALLOWED_FILE_TYPES), maximumSizeInBytes: MAX_FILE_BYTES, addRandomSuffix: false };
}

export type AttachInput = { pathname: string; kind: string; description?: string | null; fileName: string };

/** Records a file the browser has just uploaded to Blob. A file that fails the checks is deleted. */
export async function attachFile(db: Db, actor: Actor | null, submissionId: string, input: AttachInput, store: FileStore = blobStore): Promise<string> {
  authorize(actor, "documents:update");
  const sub = await savedSubmission(db, submissionId);
  const p = new Problems();
  const pathname = input.pathname.trim();
  if (!inSubmissionFolder(submissionId, pathname)) throw blocked("That file was not uploaded for this submission.");
  const kind = input.kind as FileKind;
  if (!(FILE_KINDS as readonly string[]).includes(kind)) p.field("kind", `Choose what the file is: ${FILE_KINDS.join(", ")}.`);
  const fileName = input.fileName.trim().slice(0, 200) || pathname.split("/").pop()!;
  const description = input.description?.trim().slice(0, 300) || null;
  const stat = await store.stat(pathname);
  if (!stat) throw blocked("The upload did not finish. Try again.");
  const type = stat.contentType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_FILE_TYPES[type]) p.reason(`${fileName} is not a PDF, JPEG, PNG or TIFF file.`);
  if (stat.size > MAX_FILE_BYTES) p.reason(`${fileName} is ${formatBytes(stat.size)}; the limit is ${formatBytes(MAX_FILE_BYTES)}.`);
  if (stat.size === 0) p.reason(`${fileName} is empty.`);
  if (p.any) {
    await store.remove([pathname]);
    p.throwIfAny();
  }
  await db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: submissionFiles.id }).from(submissionFiles).where(eq(submissionFiles.blobPath, pathname));
    if (dup) throw blocked("That file is already on this submission.");
    const [f] = await tx
      .insert(submissionFiles)
      .values({ submissionId, kind, description, fileName, contentType: type, sizeBytes: stat.size, blobPath: pathname, uploadedBy: actor.id, uploadedByName: actor.name })
      .returning({ id: submissionFiles.id });
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "File uploaded",
      module: "registration",
      entityType: "submission",
      entityId: submissionId,
      reference: sub.ackNo,
      detail: `${kind}: ${fileName} (${ALLOWED_FILE_TYPES[type]}, ${formatBytes(stat.size)})${description ? `, ${description}` : ""}`,
      data: { fileId: f.id },
    });
  });
  return `${fileName} uploaded.`;
}

/** Deletes the stored file and keeps the row with who removed it and why. */
export async function removeFile(db: Db, actor: Actor | null, fileId: string, reason: string, store: FileStore = blobStore): Promise<string> {
  authorize(actor, "documents:update");
  const why = reason.trim();
  if (!why) new Problems().field("reason", "Say why the file is being removed (for example: wrong operator's form).").throwIfAny();
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw notFound("File");
  const f = await db.transaction(async (tx) => {
    const [f] = await tx.select().from(submissionFiles).where(eq(submissionFiles.id, fileId)).for("update");
    if (!f) throw notFound("File");
    if (f.removedAt) throw blocked(`${f.fileName} was already removed.`);
    const [sub] = await tx.select({ ackNo: submissions.ackNo }).from(submissions).where(eq(submissions.id, f.submissionId));
    await tx
      .update(submissionFiles)
      .set({ removedAt: new Date(), removedBy: actor.id, removedByName: actor.name, removedReason: why.slice(0, 300) })
      .where(eq(submissionFiles.id, fileId));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "File removed",
      module: "registration",
      entityType: "submission",
      entityId: f.submissionId,
      reference: sub?.ackNo,
      detail: `${f.kind}: ${f.fileName}; reason: ${why}`,
      data: { fileId },
    });
    return f;
  });
  await store.remove([f.blobPath]);
  return `${f.fileName} removed.`;
}

/** Every file on a submission, filed form first, oldest first; removed ones last. */
export async function listFiles(db: DbOrTx, submissionId: string): Promise<SubmissionFile[]> {
  const rows = await db.select().from(submissionFiles).where(eq(submissionFiles.submissionId, submissionId)).orderBy(asc(submissionFiles.uploadedAt));
  const rank = (f: SubmissionFile) => (f.removedAt ? 10 : 0) + FILE_KINDS.indexOf(f.kind);
  return rows.sort((a, b) => rank(a) - rank(b));
}

/** A file to stream to someone with registers:read; null when removed or missing. */
export async function openFile(db: DbOrTx, actor: Actor | null, fileId: string, store: FileStore = blobStore) {
  authorize(actor, "registers:read");
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const [f] = await db.select().from(submissionFiles).where(and(eq(submissionFiles.id, fileId), isNull(submissionFiles.removedAt)));
  if (!f) return null;
  const body = await store.open(f.blobPath);
  return body ? { file: f, ...body } : null;
}
