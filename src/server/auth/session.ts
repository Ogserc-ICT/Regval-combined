import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Permission } from "@/domain/roles";
import { db } from "../db/client";
import { checkIdle } from "../services/idle";
import { getActorById } from "../services/users";
import { can, type Actor } from "./actor";
import { auth } from "./auth";

export type CurrentSession = { actor: Actor; sessionId: string };

/**
 * The signed-in user and session, read once per request. A session idle past
 * the limit is ended here (docs/PLAN.md §11f, 8c), so every page, action and
 * route handler refuses it.
 */
const current = cache(async (): Promise<{ session: CurrentSession | null; idle: boolean }> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, idle: false };
  if ((await checkIdle(db, session.session.id)) !== "active") return { session: null, idle: true };
  const actor = await getActorById(db, session.user.id);
  if (!actor || !actor.active) return { session: null, idle: false };
  return { session: { actor, sessionId: session.session.id }, idle: false };
});

export const getCurrentSession = async (): Promise<CurrentSession | null> => (await current()).session;

/** The signed-in user with roles, or null. */
export const getCurrentActor = async (): Promise<Actor | null> => (await current()).session?.actor ?? null;

/** Where to come back to after signing in: the page being requested (set by the proxy). */
async function signInUrl(idle: boolean): Promise<string> {
  const path = (await headers()).get("x-ogserc-path");
  const qs = new URLSearchParams();
  if (path && path.startsWith("/") && !path.startsWith("//") && path !== "/") qs.set("next", path);
  if (idle) qs.set("reason", "idle");
  const s = qs.toString();
  return s ? `/sign-in?${s}` : "/sign-in";
}

/** For pages: the signed-in user, or a redirect to sign in / change password. */
export async function requireActor(opts: { allowPasswordChange?: boolean } = {}): Promise<Actor> {
  const { session, idle } = await current();
  if (!session) redirect(await signInUrl(idle));
  const actor = session.actor;
  if (actor.mustChangePassword && !opts.allowPasswordChange) redirect("/account/password");
  return actor;
}

/** For pages that need a permission: shows the not-allowed page instead of the content. */
export async function requirePermission(permission: Permission): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor, permission)) redirect(`/not-allowed?need=${encodeURIComponent(permission)}`);
  return actor;
}
