/** Register export as CSV or .xlsx (admin only). ?format=csv|xlsx */
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { exportRegister } from "@/server/services/exports";

export async function GET(req: Request, { params }: { params: Promise<{ register: string }> }) {
  const actor = await getCurrentActor();
  const { register } = await params;
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  try {
    const out = await exportRegister(db, actor, register, format);
    const body = typeof out.body === "string" ? out.body : new Uint8Array(out.body);
    return new Response(body, {
      headers: { "Content-Type": out.contentType, "Content-Disposition": `attachment; filename="${out.filename}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof ServiceError) return new Response(e.reasons.join(" "), { status: e.status });
    throw e;
  }
}
