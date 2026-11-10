import {
  BookOpenCheck, CalendarDays, ClipboardCheck, Database, Download, FileStack, Gauge, History, PenLine, Printer, Rocket,
  Eraser, Settings, Sunrise, Users, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import type { NavIcon } from "./nav";

/** One icon per nav entry, shared by the desktop sidebar and the mobile drawer. */
export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: Gauge, register: BookOpenCheck, payments: Wallet, documents: FileStack, evaluation: ClipboardCheck,
  ownuse: Zap, reports: Printer, audit: History, settings: Settings, holidays: CalendarDays, users: Users,
  signatories: PenLine, review: Sunrise, reference: Database, exports: Download, data: Eraser, golive: Rocket,
};

/** Active when on the item's page or one of its sub-pages (so /register does not light up for /register-x). */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
