/**
 * Live updates and notifications (docs/PLAN.md §11f, 8a and 8b). Open tabs poll
 * this every few seconds. Every change in the app writes an audit row, so the
 * audit chain's sequence number is a version for "anything changed". The
 * person's unread notifications ride along. Reading this never counts as
 * activity for the idle sign-out.
 */
import { sql } from "drizzle-orm";
import { getCurrentActor } from "@/server/auth/session";
import { all } from "@/server/db/connect";
import { db } from "@/server/db/client";
import type { Pulse } from "@/lib/pulse";
import { unreadSummary } from "@/server/services/notifications";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return Response.json({ signedIn: false }, { status: 401, headers: NO_STORE });
  const [r, n] = await all(db, [
    () => db.execute<{ seq: string | number }>(sql`select seq from audit_chain_head where id = 1`),
    () => unreadSummary(db, actor.id),
  ]);
  const body: Pulse = { v: Number(r.rows[0]?.seq ?? 0), unread: n.unread, newest: n.newest };
  return Response.json(body, { headers: NO_STORE });
}
