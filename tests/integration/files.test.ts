/**
 * Files kept with a submission (Q23 step 1): the filed form and scans, in a private Blob store.
 * A fake store stands in for Vercel Blob.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inSubmissionFolder, uploadPathname } from "../../src/domain/files";
import type { FileStore } from "../../src/server/blob";
import { auditLog, submissionFiles } from "../../src/server/db/schema";
import { ServiceError } from "../../src/server/errors";
import { clearData, deleteSubmission } from "../../src/server/services/data-admin";
import { attachFile, authorizeUpload, listFiles, openFile, removeFile } from "../../src/server/services/files";
import { createSubmission } from "../../src/server/services/submissions/save";
import { dbErrorMessage, makeActor, resetTables, testDb } from "./helpers";

const db = testDb(10);
afterAll(() => db.$client.end());
beforeEach(() => resetTables(db));

async function failure(p: Promise<unknown>): Promise<ServiceError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return e;
    throw e;
  }
  throw new Error("expected a ServiceError");
}

function fakeStore() {
  const files = new Map<string, { size: number; contentType: string }>();
  const removed: string[] = [];
  const store: FileStore = {
    stat: async (p) => files.get(p) ?? null,
    open: async (p) => {
      const f = files.get(p);
      return f ? { stream: new ReadableStream(), ...f } : null;
    },
    remove: async (ps) => {
      for (const p of ps) {
        files.delete(p);
        removed.push(p);
      }
    },
  };
  return { files, removed, store };
}

let n = 0;
const filing = () => ({
  filingType: "NEW",
  formFiled: "REG-01D",
  registeredName: `Files Test ${++n} Ltd`,
  dateSubmitted: "2026-11-04",
  timeReceived: "10:00",
  submissionChannel: "By hand",
  principalLga: "Sagamu",
  primaryActivity: "GEN",
  installedCapacityMw: 5,
  licenceStatus: "OGSERC licence/permit",
  licences: [{ licenceNo: `FL/${n}`, expiryDate: "2030-01-01" }],
  operatingOnEffectiveDate: "Y",
});

describe("upload paths", () => {
  it("keeps every upload in its submission's own folder", () => {
    const id = "6f1c1d2e-0000-4000-8000-000000000001";
    expect(uploadPathname(id, "REG-01D (signed) final.PDF")).toBe(`submissions/${id}/REG-01D-signed-final.pdf`);
    expect(uploadPathname(id, "....")).toBe(`submissions/${id}/file`);
    expect(inSubmissionFolder(id, `submissions/${id}/a-x1Y2.pdf`)).toBe(true);
    expect(inSubmissionFolder(id, `submissions/${id}/../other/a.pdf`)).toBe(false);
    expect(inSubmissionFolder(id, `submissions/${id}/sub/a.pdf`)).toBe(false);
    expect(inSubmissionFolder(id, `submissions/6f1c1d2e-0000-4000-8000-000000000002/a.pdf`)).toBe(false);
  });
});

describe("files on a submission", () => {
  it("uploads, lists, opens and removes a filed form, with audit entries", async () => {
    const registration = await makeActor(db, ["registration"]);
    const viewer = await makeActor(db, ["viewer"]);
    const s = await createSubmission(db, registration, filing());
    const { files, removed, store } = fakeStore();

    const limits = await authorizeUpload(db, registration, s.id, `submissions/${s.id}/form.pdf`);
    expect(limits.allowedContentTypes).toContain("application/pdf");
    expect((await failure(authorizeUpload(db, viewer, s.id, `submissions/${s.id}/form.pdf`))).status).toBe(403);
    expect((await failure(authorizeUpload(db, registration, s.id, "submissions/elsewhere/form.pdf"))).kind).toBe("blocked");

    const path = `submissions/${s.id}/form-abc123.pdf`;
    files.set(path, { size: 120_000, contentType: "application/pdf" });
    expect(await attachFile(db, registration, s.id, { pathname: path, kind: "Filed form", fileName: "REG-01D.pdf", description: "As filed" }, store)).toBe("REG-01D.pdf uploaded.");
    expect((await failure(attachFile(db, registration, s.id, { pathname: path, kind: "Filed form", fileName: "REG-01D.pdf" }, store))).reasons[0]).toContain("already");

    const [f] = await listFiles(db, s.id);
    expect(f).toMatchObject({ kind: "Filed form", fileName: "REG-01D.pdf", sizeBytes: 120_000, uploadedByName: registration.name, removedAt: null });
    expect((await openFile(db, viewer, f.id, store))?.contentType).toBe("application/pdf");

    expect((await failure(removeFile(db, viewer, f.id, "wrong", store))).status).toBe(403);
    expect((await failure(removeFile(db, registration, f.id, "  ", store))).fieldErrors.reason).toBeDefined();
    await removeFile(db, registration, f.id, "Wrong operator's form", store);
    expect(removed).toEqual([path]);
    expect(await openFile(db, viewer, f.id, store)).toBeNull();
    const [after] = await listFiles(db, s.id);
    expect(after).toMatchObject({ removedByName: registration.name, removedReason: "Wrong operator's form" });
    expect((await failure(removeFile(db, registration, f.id, "again", store))).reasons[0]).toContain("already removed");

    const trail = await db.select({ action: auditLog.action, detail: auditLog.detail }).from(auditLog).where(eq(auditLog.reference, s.ackNo));
    expect(trail.map((t) => t.action)).toEqual(expect.arrayContaining(["File uploaded", "File removed"]));
  });

  it("refuses a wrong file type, a file outside the folder and an unfinished upload, deleting what was sent", async () => {
    const registration = await makeActor(db, ["registration"]);
    const s = await createSubmission(db, registration, filing());
    const { files, removed, store } = fakeStore();
    const exe = `submissions/${s.id}/tool.exe`;
    files.set(exe, { size: 10, contentType: "application/x-msdownload" });
    const e = await failure(attachFile(db, registration, s.id, { pathname: exe, kind: "Other", fileName: "tool.exe" }, store));
    expect(e.reasons[0]).toContain("not a PDF, JPEG, PNG or TIFF");
    expect(removed).toEqual([exe]);
    expect((await failure(attachFile(db, registration, s.id, { pathname: "submissions/x/a.pdf", kind: "Other", fileName: "a.pdf" }, store))).kind).toBe("blocked");
    expect((await failure(attachFile(db, registration, s.id, { pathname: `submissions/${s.id}/gone.pdf`, kind: "Other", fileName: "gone.pdf" }, store))).reasons[0]).toContain("did not finish");
    const bad = `submissions/${s.id}/a.png`;
    files.set(bad, { size: 10, contentType: "image/png" });
    expect((await failure(attachFile(db, registration, s.id, { pathname: bad, kind: "Nonsense", fileName: "a.png" }, store))).fieldErrors.kind).toBeDefined();
    expect(await listFiles(db, s.id)).toHaveLength(0);
  });

  it("keeps rows from being deleted or rewritten outside the admin tools", async () => {
    const registration = await makeActor(db, ["registration"]);
    const s = await createSubmission(db, registration, filing());
    const { files, store } = fakeStore();
    const path = `submissions/${s.id}/f.pdf`;
    files.set(path, { size: 5, contentType: "application/pdf" });
    await attachFile(db, registration, s.id, { pathname: path, kind: "Filed form", fileName: "f.pdf" }, store);
    expect(await dbErrorMessage(db.execute(sql`delete from submission_files`))).toContain("cannot be deleted");
    expect(await dbErrorMessage(db.execute(sql`update submission_files set blob_path = 'x'`))).toContain("locked");
  });

  it("deletes the stored files when an admin deletes the entry or clears the Register", async () => {
    const registration = await makeActor(db, ["registration"]);
    const admin = await makeActor(db, ["admin"]);
    const one = await createSubmission(db, registration, filing());
    const two = await createSubmission(db, registration, filing());
    const { files, removed, store } = fakeStore();
    for (const s of [one, two]) {
      const path = `submissions/${s.id}/f.pdf`;
      files.set(path, { size: 5, contentType: "application/pdf" });
      await attachFile(db, registration, s.id, { pathname: path, kind: "Filed form", fileName: "f.pdf" }, store);
    }
    await deleteSubmission(db, admin, one.id, one.ackNo, store);
    expect(removed).toEqual([`submissions/${one.id}/f.pdf`]);
    await clearData(db, admin, ["register"], "correct horse battery", store);
    expect(removed).toEqual([`submissions/${one.id}/f.pdf`, `submissions/${two.id}/f.pdf`]);
    expect(await db.select().from(submissionFiles)).toHaveLength(0);
  });
});
