/** Acknowledgement slip PDF for one inward item (SPEC §24.1). ?download=1 to save. */
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { renderSlip, slipFileName } from "@/server/pdf/slip";
import { pdfActor, pdfResponse } from "@/server/pdf/respond";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await pdfActor("reports:print");
  if (actor instanceof Response) return actor;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  try {
    const { buffer, ackNo } = await renderSlip(db, id);
    return pdfResponse(buffer, slipFileName(ackNo), new URL(req.url).searchParams.has("download"));
  } catch (e) {
    if (e instanceof ServiceError && e.kind === "not_found") return new Response("Not found", { status: 404 });
    throw e;
  }
}
