/**
 * The current e-signature of a staff account, for the preview on Admin › Staff & roles.
 * Admins only; never cached.
 */
import { db } from "@/server/db/client";
import { pdfActor } from "@/server/pdf/respond";
import { signatureImage } from "@/server/services/signatures";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found.", { status: 404 });
  const actor = await pdfActor("users:manage");
  if (actor instanceof Response) return actor;
  const img = await signatureImage(db, actor, id);
  if (!img) return new Response("No signature.", { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}
