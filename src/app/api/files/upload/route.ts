/**
 * Upload permission for files kept with a submission. The browser asks here first; the server
 * checks the person's role and the submission, then lets the browser put exactly one file at
 * a pathname under submissions/{id}/ in the private Blob store: a client token when the store
 * is connected with BLOB_READ_WRITE_TOKEN, a presigned URL when it is connected through OIDC
 * (BLOB_STORE_ID). The browser then calls attachFileAction to record it (no upload-completed
 * webhook, so this also works in local development and on preview deployments).
 */
import { issueSignedToken } from "@vercel/blob";
import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { getCurrentActor } from "@/server/auth/session";
import { blobMode } from "@/server/blob";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { authorizeUpload } from "@/server/services/files";

export const runtime = "nodejs";

const submissionIdFrom = (clientPayload: string | null) => {
  try {
    return String((JSON.parse(clientPayload ?? "{}") as { submissionId?: unknown }).submissionId ?? "");
  } catch {
    return "";
  }
};

export async function POST(req: Request): Promise<Response> {
  const mode = blobMode();
  if (!mode) return Response.json({ error: "File storage is not set up (connect a private Blob store)." }, { status: 503 });
  const actor = await getCurrentActor();
  if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  let body: HandleUploadBody | HandleUploadPresignedBody;
  try {
    body = (await req.json()) as HandleUploadBody | HandleUploadPresignedBody;
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    if (body.type === "blob.generate-client-token" && mode === "token") {
      const result = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const limits = await authorizeUpload(db, actor, submissionIdFrom(clientPayload), pathname);
          return { ...limits, allowOverwrite: false };
        },
      });
      return Response.json(result);
    }
    if (body.type === "blob.generate-presigned-url") {
      const result = await handleUploadPresigned({
        body,
        request: req,
        getSignedToken: async (pathname, clientPayload) => {
          const limits = await authorizeUpload(db, actor, submissionIdFrom(clientPayload), pathname);
          const token = await issueSignedToken({ pathname, operations: ["put"], validUntil: Date.now() + 30 * 60 * 1000, ...limits });
          return { token, urlOptions: { ...limits, allowOverwrite: false } };
        },
      });
      return Response.json(result);
    }
    return Response.json({ error: "Not supported." }, { status: 400 });
  } catch (e) {
    if (e instanceof ServiceError) {
      const status = e.kind === "forbidden" ? 403 : e.kind === "not_found" ? 404 : 409;
      return Response.json({ error: e.reasons.join(" ") }, { status });
    }
    console.error("Upload permission failed", e);
    return Response.json({ error: "Could not start the upload. Try again." }, { status: 500 });
  }
}
