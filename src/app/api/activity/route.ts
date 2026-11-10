/**
 * The browser reports real activity here (mouse, keyboard, touch, scroll), at
 * most every 20 seconds (docs/PLAN.md §11f, 8c). It is the only thing that
 * keeps a session from going idle.
 */
import { getCurrentSession } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { touchSession } from "@/server/services/idle";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST() {
  const s = await getCurrentSession();
  if (!s) return Response.json({ signedIn: false }, { status: 401, headers: NO_STORE });
  await touchSession(db, s.sessionId);
  return Response.json({ ok: true }, { headers: NO_STORE });
}
