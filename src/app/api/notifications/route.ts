/** The signed-in person's latest notifications, for the bell's list (docs/PLAN.md §11f, 8b). */
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listNotifications } from "@/server/services/notifications";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return Response.json({ signedIn: false }, { status: 401, headers: NO_STORE });
  return Response.json({ items: await listNotifications(db, actor.id) }, { headers: NO_STORE });
}
