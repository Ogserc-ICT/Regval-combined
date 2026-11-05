/**
 * The signed-in user as services see it, and the role checks every service
 * makes before acting ([G6]–[G8]). Kept free of Next.js imports so services
 * and tests can use it directly.
 */
import { hasPermission, ROLE_LABELS, PERMISSIONS, type Permission, type Role } from "@/domain/roles";
import type { AuditActor } from "../audit";
import { forbidden, ServiceError } from "../errors";

export type Actor = {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  active: boolean;
  mustChangePassword: boolean;
  /** Unit officers: the unit they act for (SPEC §20). */
  unitId?: string | null;
};

export function auditActor(actor: Actor): AuditActor {
  return { id: actor.id, name: actor.name };
}

export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  return !!actor && actor.active && hasPermission(actor.roles, permission);
}

/** Throws 401/403 unless the actor holds a role that grants the permission. */
export function authorize(actor: Actor | null | undefined, permission: Permission): asserts actor is Actor {
  if (!actor) throw new ServiceError("unauthenticated", ["Sign in to continue."]);
  if (!actor.active) throw forbidden("Your account is not active. Ask an admin.");
  if (!hasPermission(actor.roles, permission)) {
    const allowed = (PERMISSIONS[permission] as readonly Role[]).map((r) => ROLE_LABELS[r]);
    throw forbidden(`Only ${joinOr(allowed)} can do this.`);
  }
}

function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
