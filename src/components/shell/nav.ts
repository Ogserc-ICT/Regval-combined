/**
 * Sidebar: one entry per module (docs/COMBINED_BUILD.md "Modules and roles").
 * Modules not built yet are shown, disabled, with the phase that delivers them.
 */
import type { Permission } from "@/domain/roles";

export type NavIcon =
  | "dashboard" | "frontdesk" | "intake" | "inward" | "routing" | "outward" | "files" | "pending"
  | "register" | "payments" | "documents" | "evaluation" | "ownuse" | "reports" | "audit"
  | "settings" | "holidays" | "users";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  permission: Permission;
  /** The phase that builds it, while it is not built. */
  phase?: number;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "registers:read" }],
  },
  {
    label: "Registry",
    items: [
      { label: "Front desk", href: "/front-desk", icon: "frontdesk", permission: "registers:read", phase: 3 },
      { label: "Registry intake", href: "/registry-intake", icon: "intake", permission: "registers:read", phase: 3 },
      { label: "Inward", href: "/inward", icon: "inward", permission: "registers:read", phase: 3 },
      { label: "Routing", href: "/routing", icon: "routing", permission: "registers:read", phase: 3 },
      { label: "Outward", href: "/outward", icon: "outward", permission: "registers:read", phase: 3 },
      { label: "Files", href: "/files", icon: "files", permission: "registers:read", phase: 3 },
      { label: "Pending actions", href: "/pending", icon: "pending", permission: "registers:read", phase: 3 },
    ],
  },
  {
    label: "Registration",
    items: [
      { label: "Register", href: "/register", icon: "register", permission: "registers:read", phase: 2 },
      { label: "Payments & Finance", href: "/payments", icon: "payments", permission: "registers:read", phase: 2 },
      { label: "Documents", href: "/documents", icon: "documents", permission: "registers:read", phase: 2 },
      { label: "Evaluation", href: "/evaluation", icon: "evaluation", permission: "registers:read", phase: 2 },
      { label: "Own-use", href: "/own-use", icon: "ownuse", permission: "registers:read", phase: 2 },
    ],
  },
  {
    label: "Records",
    items: [
      { label: "Reports", href: "/reports", icon: "reports", permission: "registers:read", phase: 4 },
      { label: "Audit log", href: "/audit", icon: "audit", permission: "audit:read" },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Settings", href: "/admin/settings", icon: "settings", permission: "registers:read" },
      { label: "Holidays", href: "/admin/holidays", icon: "holidays", permission: "registers:read" },
      { label: "Staff & roles", href: "/admin/users", icon: "users", permission: "users:manage" },
    ],
  },
];
