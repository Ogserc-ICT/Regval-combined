/**
 * The signed-in person's form work for one page (docs/PLAN.md §11f, 8c).
 * PUT saves it just before an idle sign-out; GET gives it back after signing
 * in again; DELETE drops it once restored or when the person stays. None of
 * these count as activity, and nobody can reach another person's drafts.
 */
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { deleteDraft, DRAFT_MAX_BYTES, draftSchema, getDraft, isDraftPath, saveDraft } from "@/server/services/drafts";

const NO_STORE = { "Cache-Control": "no-store" };
const unauthorized = () => Response.json({ signedIn: false }, { status: 401, headers: NO_STORE });
const bad = (msg: string) => Response.json({ error: msg }, { status: 400, headers: NO_STORE });

function pathOf(req: Request): string | null {
  const p = new URL(req.url).searchParams.get("path");
  return isDraftPath(p) ? p : null;
}

export async function GET(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return unauthorized();
  const path = pathOf(req);
  if (!path) return bad("Unknown page.");
  return Response.json({ draft: await getDraft(db, actor.id, path) }, { headers: NO_STORE });
}

export async function PUT(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return unauthorized();
  const path = pathOf(req);
  if (!path) return bad("Unknown page.");
  const text = await req.text();
  if (text.length > DRAFT_MAX_BYTES) return bad("Too much to keep.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return bad("Not JSON.");
  }
  const parsed = draftSchema.safeParse(json);
  if (!parsed.success) return bad("Not a draft.");
  await saveDraft(db, actor.id, path, parsed.data);
  return Response.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return unauthorized();
  const path = pathOf(req);
  if (!path) return bad("Unknown page.");
  await deleteDraft(db, actor.id, path);
  return Response.json({ ok: true }, { headers: NO_STORE });
}
