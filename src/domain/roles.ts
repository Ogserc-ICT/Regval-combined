/**
 * Roles and permissions (SPEC §27; [G6], [G8]). [G7] no longer applies: the Registry was removed.
 *
 * A user can hold several roles. A permission names one kind of action; the
 * server checks it before every action. Record-level rules (separation of
 * duties, "the assigned officer only") are checked by each service on top.
 */

export const ROLES = [
  "registration",
  "evaluator",
  "supervisor",
  "approver",
  "finance",
  "admin",
  "viewer",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  registration: "Registration officer",
  evaluator: "Evaluating officer",
  supervisor: "Reviewing supervisor",
  approver: "Approving officer",
  finance: "Finance officer",
  admin: "Admin",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  registration: "Enter filings and own-use notifications, record payments, keep the document checklist, record when letters and certificates are sent",
  evaluator: "Complete EVAL-01 checks",
  supervisor: "Review evaluations, assign officers, issue deficiency notices",
  approver: "Approve, refuse, lapse",
  finance: "Record, confirm, reject and reverse payments",
  admin: "Settings, lists, holidays, users and roles, signatories; cancel; recalculate; daily review; exports",
  viewer: "Dashboards and registers, read-only",
};

export const PERMISSIONS = {
  // Everyone signed in
  "registers:read": ["registration", "evaluator", "supervisor", "approver", "finance", "admin", "viewer"],
  "audit:read": ["admin", "viewer", "registration", "supervisor", "approver", "finance"],
  // Registration
  "submission:save": ["registration"],
  "ownuse:save": ["registration"],
  /** The date a deficiency notice or certificate was actually sent (no Registry numbers them now). */
  "letters:record-sent": ["registration"],
  /** The four registration documents (Phase 10): staff who send them or act on the evaluation. */
  "reports:print": ["registration", "evaluator", "supervisor", "approver", "admin"],
  "payment:record": ["registration", "finance"],
  "payment:decide": ["finance"],
  "payment:reverse": ["finance", "admin"],
  "documents:update": ["registration", "evaluator", "supervisor"],
  "evaluation:assign": ["supervisor", "admin"],
  "signatories:manage": ["admin"],
  "evaluation:check": ["evaluator", "supervisor"],
  "evaluation:deficiency": ["supervisor"],
  "evaluation:decide": ["approver"],
  "submission:cancel": ["admin"],
  "pricing:recalculate": ["admin"],
  // Admin
  "settings:write": ["admin"],
  "lists:write": ["admin"],
  "users:manage": ["admin"],
  "dailyreview:run": ["admin"],
  "registers:export": ["admin"],
  /** Admin › Data management: clear registers (up to a factory reset) and delete entries. */
  "data:clear": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((r) => allowed.includes(r));
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
