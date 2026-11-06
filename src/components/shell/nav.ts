/**
 * Sidebar: one entry per module (docs/COMBINED_BUILD.md "Modules and roles").
 * Modules not built yet are shown, disabled, with the phase that delivers them.
 */
import type { Permission } from "@/domain/roles";

export type NavIcon =
  | "dashboard" | "frontdesk" | "intake" | "inward" | "routing" | "outward" | "files" | "pending"
  | "register" | "payments" | "documents" | "evaluation" | "ownuse" | "reports" | "audit"
  | "settings" | "holidays" | "users" | "signatories" | "review" | "reference" | "exports" | "import" | "golive";

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
      { label: "Front desk", href: "/front-desk", icon: "frontdesk", permission: "registers:read" },
      { label: "Registry intake", href: "/registry-intake", icon: "intake", permission: "registers:read" },
      { label: "Inward", href: "/inward", icon: "inward", permission: "registers:read" },
      { label: "Routing", href: "/routing", icon: "routing", permission: "registers:read" },
      { label: "Outward", href: "/outward", icon: "outward", permission: "registers:read" },
      { label: "Files", href: "/files", icon: "files", permission: "registers:read" },
      { label: "Pending actions", href: "/pending", icon: "pending", permission: "registers:read" },
    ],
  },
  {
    label: "Registration",
    items: [
      { label: "Register", href: "/register", icon: "register", permission: "registers:read" },
      { label: "Payments & Finance", href: "/payments", icon: "payments", permission: "registers:read" },
      { label: "Documents", href: "/documents", icon: "documents", permission: "registers:read" },
      { label: "Evaluation", href: "/evaluation", icon: "evaluation", permission: "registers:read" },
      { label: "Own-use", href: "/own-use", icon: "ownuse", permission: "registers:read" },
    ],
  },
  {
    label: "Records",
    items: [
      { label: "Reports", href: "/reports", icon: "reports", permission: "registers:read" },
      { label: "Audit log", href: "/audit", icon: "audit", permission: "audit:read" },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Settings", href: "/admin/settings", icon: "settings", permission: "registers:read" },
      { label: "Reference data", href: "/admin/reference", icon: "reference", permission: "registers:read" },
      { label: "Holidays", href: "/admin/holidays", icon: "holidays", permission: "registers:read" },
      { label: "Signatories", href: "/admin/signatories", icon: "signatories", permission: "registers:read" },
      { label: "Staff & roles", href: "/admin/users", icon: "users", permission: "users:manage" },
      { label: "Daily review", href: "/admin/daily-review", icon: "review", permission: "registers:read" },
      { label: "Export registers", href: "/admin/exports", icon: "exports", permission: "registers:export" },
      { label: "Import", href: "/admin/import", icon: "import", permission: "settings:write" },
      { label: "Go-live checks", href: "/admin/go-live", icon: "golive", permission: "settings:write" },
    ],
  },
];
