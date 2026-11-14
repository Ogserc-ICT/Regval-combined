/**
 * Upload tokens for files kept with a submission. The browser asks here first; the server
 * checks the person's role and the submission, then hands back a short-lived token that lets
 * the browser put exactly one file under submissions/{id}/ in the private Blob store. The
 * browser then calls attachFileAction to record it (no upload-completed webhook, so this also
 * works in local development and on preview deployments).
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentActor } from "@/server/auth/session";
import { blobEnabled } from "@/server/blob";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { authorizeUpload } from "@/server/services/files";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!blobEnabled()) return Response.json({ error: "File storage is not set up (BLOB_READ_WRITE_TOKEN)." }, { status: 503 });
  const actor = await getCurrentActor();
  if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  if (body.type !== "blob.generate-client-token") return Response.json({ error: "Not supported." }, { status: 400 });
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let submissionId = "";
        try {
          submissionId = String((JSON.parse(clientPayload ?? "{}") as { submissionId?: unknown }).submissionId ?? "");
        } catch {
          /* checked below */
        }
        const limits = await authorizeUpload(db, actor, submissionId, pathname);
        return { ...limits, tokenPayload: JSON.stringify({ submissionId, userId: actor.id }) };
      },
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof ServiceError) {
      const status = e.kind === "forbidden" ? 403 : e.kind === "not_found" ? 404 : 409;
      return Response.json({ error: e.reasons.join(" ") }, { status });
    }
    console.error("Upload token failed", e);
    return Response.json({ error: "Could not start the upload. Try again." }, { status: 500 });
  }
}
