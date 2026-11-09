"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/cn";
import type { NavGroup } from "./nav";
import { isActive, NAV_ICONS } from "./nav-icons";

/**
 * The phone/tablet menu (below md). The drawer is portalled to <body>: the sticky header uses
 * backdrop-blur, and a backdrop-filter traps `position: fixed` children inside the header box,
 * which is what broke the old drawer.
 */
export function MobileNav({ groups, userName, userRoles }: { groups: NavGroup[]; userName: string; userRoles: string }) {
  const pathname = usePathname();
  // The drawer belongs to the page it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenOn(null);
    };
    // Rotating a tablet past md shows the sidebar; drop the drawer then.
    const wide = window.matchMedia("(min-width: 48rem)");
    const onWide = () => wide.matches && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        className="-ml-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-text"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={() => setOpenOn(null)} aria-hidden="true" />
              <div
                id="mobile-nav"
                className="animate-slide-in absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-border bg-bg-subtle shadow-2xl"
              >
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
                  <Logo height={20} />
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => setOpenOn(null)}
                    aria-label="Close menu"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-text"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-3" aria-label="Main">
                  {groups.map((g) => (
                    <div key={g.label} className="mb-4">
                      <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">{g.label}</p>
                      <ul className="space-y-0.5">
                        {g.items.map((i) => {
                          const Icon = NAV_ICONS[i.icon];
                          const active = isActive(pathname, i.href);
                          return (
                            <li key={i.href}>
                              {i.phase ? (
                                <span className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-faint" aria-disabled="true">
                                  <Icon className="h-4 w-4 shrink-0" />
                                  <span className="flex-1 truncate">{i.label}</span>
                                  <span className="text-[10px]">Phase {i.phase}</span>
                                </span>
                              ) : (
                                <Link
                                  href={i.href}
                                  // A tap on the current page does not change the path, so close explicitly.
                                  onClick={() => setOpenOn(null)}
                                  aria-current={active ? "page" : undefined}
                                  className={cn(
                                    "flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                                    active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-hover hover:text-text",
                                  )}
                                >
                                  <Icon className="h-4 w-4 shrink-0" />
                                  <span className="truncate">{i.label}</span>
                                </Link>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </nav>

                <div className="shrink-0 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <p className="truncate text-sm font-medium text-text">{userName}</p>
                  <p className="truncate text-xs text-faint">{userRoles}</p>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
