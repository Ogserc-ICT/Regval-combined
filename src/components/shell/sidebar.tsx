"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo, LogoMark } from "@/components/logo";
import { cn } from "@/lib/cn";
import type { NavGroup } from "./nav";
import { isActive, NAV_ICONS } from "./nav-icons";

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-bg-subtle transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <Link
        href="/dashboard"
        className={cn("flex h-16 items-center gap-3 border-b border-border px-4", collapsed && "justify-center px-0")}
        aria-label="OGSERC Registry & Evaluation: dashboard"
      >
        {collapsed ? (
          <LogoMark size={36} />
        ) : (
          <div className="min-w-0">
            <Logo height={22} />
            <p className="mt-1 truncate text-[11px] text-faint">Registry &amp; Evaluation</p>
          </div>
        )}
      </Link>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            {!collapsed && <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">{g.label}</p>}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = isActive(pathname, item.href);
                const base = cn(
                  "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                  collapsed && "justify-center px-0",
                );
                if (item.phase) {
                  return (
                    <li key={item.href}>
                      <span
                        className={cn(base, "cursor-not-allowed text-faint")}
                        title={`${item.label}: built in Phase ${item.phase}`}
                        aria-disabled="true"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{item.label}</span>
                            <span className="rounded border border-border px-1.5 text-[10px] font-medium">P{item.phase}</span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        base,
                        active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-hover hover:text-text",
                      )}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-11 items-center justify-center gap-2 border-t border-border text-xs text-faint hover:text-text"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
