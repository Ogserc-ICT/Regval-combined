"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/cn";
import type { NavGroup } from "./nav";

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-hover"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-border bg-bg-subtle p-3">
            <div className="mb-3 flex items-center justify-between px-2">
              <Logo height={20} />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-muted hover:bg-surface-hover">
                <X className="h-4 w-4" />
              </button>
            </div>
            {groups.map((g) => (
              <div key={g.label} className="mb-3">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">{g.label}</p>
                {g.items.map((i) =>
                  i.phase ? (
                    <span key={i.href} className="flex h-9 items-center justify-between rounded-lg px-2 text-sm text-faint">
                      {i.label}
                      <span className="text-[10px]">Phase {i.phase}</span>
                    </span>
                  ) : (
                    <Link
                      key={i.href}
                      href={i.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex h-9 items-center rounded-lg px-2 text-sm",
                        pathname.startsWith(i.href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-hover",
                      )}
                    >
                      {i.label}
                    </Link>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
