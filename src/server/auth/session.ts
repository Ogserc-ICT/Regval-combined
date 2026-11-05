import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Permission } from "@/domain/roles";
import { db } from "../db/client";
import { getActorById } from "../services/users";
import { can, type Actor } from "./actor";
import { auth } from "./auth";

/** The signed-in user with roles, or null. Read once per request. */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const actor = await getActorById(db, session.user.id);
  if (!actor || !actor.active) return null;
  return actor;
});

/** For pages: the signed-in user, or a redirect to sign in / change password. */
export async function requireActor(opts: { allowPasswordChange?: boolean } = {}): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/sign-in");
  if (actor.mustChangePassword && !opts.allowPasswordChange) redirect("/account/password");
  return actor;
}

/** For pages that need a permission: shows the not-allowed page instead of the content. */
export async function requirePermission(permission: Permission): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor, permission)) redirect(`/not-allowed?need=${encodeURIComponent(permission)}`);
  return actor;
}
