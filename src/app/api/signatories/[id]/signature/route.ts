/**
 * A signatory's own e-signature, for the preview on Admin › Signatories.
 * Admins only; never cached.
 */
import { db } from "@/server/db/client";
import { pdfActor } from "@/server/pdf/respond";
import { signatorySignatureImage } from "@/server/services/signatures";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found.", { status: 404 });
  const actor = await pdfActor("signatories:manage");
  if (actor instanceof Response) return actor;
  const img = await signatorySignatureImage(db, actor, id);
  if (!img) return new Response("No signature.", { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}
