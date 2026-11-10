/**
 * In-app notifications (docs/PLAN.md §11f, 8b) and the form work kept when an
 * idle session is signed out (8c).
 */
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What happened, for grouping and tests (e.g. "inward:routed"). */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** The business number shown to staff: ACK, FD, PAY … */
    reference: text("reference"),
    /** Where the notification takes the person. Always an in-app path. */
    href: text("href").notNull(),
    actorName: text("actor_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
  ],
);

/**
 * What a person had typed on a page when they were signed out for inactivity
 * (8c). One per person and page; restored to the same person only, then
 * deleted. Kept at most 24 hours. Password and file fields are never saved.
 */
export const formDrafts = pgTable(
  "form_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Path and query of the page, e.g. /register/<id>?tab=details. */
    path: text("path").notNull(),
    data: jsonb("data").notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("form_drafts_user_path_uq").on(t.userId, t.path)],
);
