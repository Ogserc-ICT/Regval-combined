import { getCurrentActor } from "@/server/auth/session";
import { can, type Actor } from "@/server/auth/actor";
import type { Permission } from "@/domain/roles";

/** Route-handler guard: 401 without a session, 403 without the permission. */
export async function pdfActor(permission: Permission): Promise<Actor | Response> {
  const actor = await getCurrentActor();
  if (!actor) return new Response("Sign in to continue.", { status: 401 });
  if (!can(actor, permission)) return new Response("You do not have permission to print this.", { status: 403 });
  return actor;
}

export function pdfResponse(buffer: Buffer, filename: string, download: boolean): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
