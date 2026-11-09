import {
  Archive, BookOpenCheck, CalendarDays, ClipboardCheck, Database, Download, FileInput, FileOutput, FileStack,
  FolderOpen, Gauge, History, Inbox, ListTodo, PenLine, Printer, Rocket, Route, Settings, Sunrise, Upload,
  Users, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import type { NavIcon } from "./nav";

/** One icon per nav entry, shared by the desktop sidebar and the mobile drawer. */
export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: Gauge, frontdesk: Inbox, intake: FileInput, inward: Archive, routing: Route, outward: FileOutput,
  files: FolderOpen, pending: ListTodo, register: BookOpenCheck, payments: Wallet, documents: FileStack,
  evaluation: ClipboardCheck, ownuse: Zap, reports: Printer, audit: History, settings: Settings,
  holidays: CalendarDays, users: Users, signatories: PenLine, review: Sunrise, reference: Database, exports: Download, import: Upload, golive: Rocket,
};

/** Active when on the item's page or one of its sub-pages (so /files does not light up for /files-x). */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
