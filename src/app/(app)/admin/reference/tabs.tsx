"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  ["/admin/reference/fees", "Fees & activities"],
  ["/admin/reference/units", "Units & emails"],
  ["/admin/reference/types", "Correspondence types"],
  ["/admin/reference/lists", "Lists"],
  ["/admin/reference/order", "Forms, documents & checks"],
] as const;

export function ReferenceTabs() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Reference data">
      {TABS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", path === href ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text")}
          aria-current={path === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
