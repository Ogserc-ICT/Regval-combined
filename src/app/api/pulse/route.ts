/**
 * Live updates (docs/PLAN.md §11f, 8a). Open tabs poll this every few seconds.
 * Every change in the app writes an audit row, so the audit chain's sequence
 * number is a version for "anything changed". Reading it never counts as
 * activity for the idle sign-out.
 */
import { sql } from "drizzle-orm";
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return Response.json({ signedIn: false }, { status: 401, headers: NO_STORE });
  const r = await db.execute<{ seq: string | number }>(sql`select seq from audit_chain_head where id = 1`);
  return Response.json({ v: Number(r.rows[0]?.seq ?? 0) }, { headers: NO_STORE });
}
