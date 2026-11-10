/**
 * In-app notifications (docs/PLAN.md §11f, 8b). Written in the same transaction
 * as the action that causes them, one row per recipient.
 */
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
