/** Pending actions PDF, for one unit or all (SPEC §23). Unit officers default to their unit. */
import { db } from "@/server/db/client";
import { renderPending } from "@/server/pdf/registers";
import { pdfActor, pdfResponse } from "@/server/pdf/respond";
import { lagosToday } from "@/server/time";

export async function GET(req: Request) {
  const actor = await pdfActor("registers:read");
  if (actor instanceof Response) return actor;
  const sp = new URL(req.url).searchParams;
  const unit = sp.has("unit") ? sp.get("unit") || null : (actor.unitId ?? null);
  if (unit && !/^[0-9a-f-]{36}$/i.test(unit)) return new Response("Unknown unit.", { status: 400 });
  const buffer = await renderPending(db, unit, actor.name);
  return pdfResponse(buffer, `Pending-actions-${lagosToday()}.pdf`, sp.has("download"));
}
