/**
 * A payment handover batch as a file (docs/REVENUE-REGISTRY-CONTRACT.md §4):
 * /api/handover/OGSERC-EXP-2026-0001 (.xlsx), ?format=csv for the Payments sheet as CSV.
 * Finance and Admin only. The file is the same on every download; each download is audited.
 */
import { getCurrentActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { batchNoFromSlug, batchSlug } from "@/domain/handover";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { batchCsv, batchXlsx, getBatch, recordDownload } from "@/server/services/handover";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ batch: string }> }): Promise<Response> {
  const { batch } = await params;
  const actor = await getCurrentActor();
  if (!actor) return new Response("Sign in to continue.", { status: 401 });
  if (!can(actor, "payments:handover")) return new Response("Only Finance and Admin can download handover batches.", { status: 403 });
  const batchNo = batchNoFromSlug(batch);
  if (!batchNo) return new Response("Not found.", { status: 404 });
  try {
    const b = await getBatch(db, actor, batchNo);
    const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
    await recordDownload(db, actor, b, format);
    const name = `${batchSlug(b.batchNo)}.${format}`;
    const body = format === "csv" ? batchCsv(b) : new Uint8Array(await batchXlsx(b));
    return new Response(body, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ServiceError && e.kind === "not_found") return new Response("No such batch.", { status: 404 });
    throw e;
  }
}
