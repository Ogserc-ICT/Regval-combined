/**
 * Opens a file kept with a submission: /api/files/{file id}, ?download=1 saves it instead.
 * Anyone who can read the Register may open it; the file is streamed from the private Blob
 * store and never given a public URL.
 */
import { getCurrentActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import { openFile } from "@/server/services/files";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return new Response("Sign in to continue.", { status: 401 });
  if (!can(actor, "registers:read")) return new Response("You do not have permission to open this file.", { status: 403 });
  const found = await openFile(db, actor, id);
  if (!found) return new Response("File not found. It may have been removed.", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = found.file.fileName.replace(/["\\\r\n]/g, "_");
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  return new Response(found.stream, {
    headers: {
      "Content-Type": found.file.contentType,
      "Content-Length": String(found.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
