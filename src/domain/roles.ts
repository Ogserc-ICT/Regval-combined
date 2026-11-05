/**
 * Roles and permissions (SPEC §27; [G6], [G7], [G8]).
 *
 * A user can hold several roles. A permission names one kind of action; the
 * server checks it before every action. Record-level rules (separation of
 * duties, "the assigned officer only") are checked by each service on top.
 */

export const ROLES = [
  "front_desk",
  "registry",
  "router",
  "unit_officer",
  "evaluator",
  "supervisor",
  "approver",
  "finance",
  "admin",
  "viewer",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  front_desk: "Front desk officer",
  registry: "Registry officer",
  router: "Router",
  unit_officer: "Unit officer",
  evaluator: "Evaluating officer",
  supervisor: "Reviewing supervisor",
  approver: "Approving officer",
  finance: "Finance officer",
  admin: "Admin",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  front_desk: "Log delivered documents",
  registry: "Intake, inward, outward, update, dispatch, files, slips, Daily Register, record payments",
  router: "Route incoming items",
  unit_officer: "See items routed to their unit, confirm receipt, close",
  evaluator: "Complete EVAL-01 checks",
  supervisor: "Review evaluations, assign officers, issue deficiency notices",
  approver: "Approve, refuse, lapse",
  finance: "Record, confirm, reject and reverse payments",
  admin: "Settings, lists, holidays, users and roles, signatories; cancel; recalculate; daily review; exports",
  viewer: "Dashboards and registers, read-only",
};

export const PERMISSIONS = {
  // Everyone signed in
  "registers:read": ["front_desk", "registry", "router", "unit_officer", "evaluator", "supervisor", "approver", "finance", "admin", "viewer"],
  "audit:read": ["admin", "viewer", "registry", "supervisor", "approver", "finance"],
  // Registry
  "frontdesk:log": ["front_desk", "registry"],
  "inward:write": ["registry"],
  "inward:route": ["router"],
  "inward:forward": ["registry"],
  "inward:confirm-receipt": ["unit_officer"],
  "inward:close": ["registry", "unit_officer"],
  "outward:write": ["registry"],
  "files:write": ["registry"],
  "reports:print": ["registry", "admin"],
  // Registration
  "submission:save": ["registry"],
  "ownuse:save": ["registry"],
  "payment:record": ["registry", "finance"],
  "payment:decide": ["finance"],
  "payment:reverse": ["finance", "admin"],
  "evaluation:assign": ["supervisor", "admin"],
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
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((r) => allowed.includes(r));
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
