/**
 * Settings, holidays, number counters and the audit log (docs/PLAN.md §3.2–3.3).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const HOLIDAY_STATUSES = ["Fixed", "Provisional", "Estimated", "State-declared"] as const;
export type HolidayStatus = (typeof HOLIDAY_STATUSES)[number];

export const holidays = pgTable(
  "holidays",
  {
    date: date("date", { mode: "string" }).primaryKey(),
    name: text("name").notNull(),
    status: text("status").$type<HolidayStatus>().notNull(),
    note: text("note"),
    updatedBy: uuid("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "holidays_status_check",
      sql`${t.status} in ('Fixed', 'Provisional', 'Estimated', 'State-declared')`,
    ),
  ],
);

/**
 * One row per number series, year and scope ([G12]). `year` is 0 for series
 * that do not restart yearly; `scope` is '' except for file references
 * (file class code).
 */
export const counters = pgTable(
  "counters",
  {
    series: text("series").notNull(),
    year: integer("year").notNull(),
    scope: text("scope").notNull().default(""),
    lastValue: integer("last_value").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.series, t.year, t.scope] }),
    check("counters_last_value_check", sql`${t.lastValue} >= 0`),
  ],
);

/**
 * Append-only audit log for both modules (SPEC §28). UPDATE, DELETE and
 * TRUNCATE are rejected by triggers (migration 0001). Each row carries the
 * hash of the previous row, so any edit made outside the app is detectable.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    seq: bigint("seq", { mode: "number" }).notNull().unique(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id"),
    userName: text("user_name").notNull(),
    action: text("action").notNull(),
    module: text("module").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    reference: text("reference"),
    detail: text("detail").notNull().default(""),
    data: jsonb("data"),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [
    index("audit_log_at_idx").on(t.at),
    index("audit_log_reference_idx").on(t.reference),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_user_idx").on(t.userId),
  ],
);

/** Single row holding the head of the audit hash chain; locked by each audit write. */
export const auditChainHead = pgTable(
  "audit_chain_head",
  {
    id: integer("id").primaryKey().default(1),
    seq: bigint("seq", { mode: "number" }).notNull().default(0),
    hash: text("hash").notNull(),
  },
  (t) => [check("audit_chain_head_single_row", sql`${t.id} = 1`)],
);

/** One row per Lagos date: the daily review runs at most once a day (SPEC §26). */
export const dailyReviewRuns = pgTable("daily_review_runs", {
  lagosDate: date("lagos_date", { mode: "string" }).primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  trigger: text("trigger").$type<"cron" | "manual">().notNull(),
  userId: uuid("user_id"),
  userName: text("user_name"),
  summary: jsonb("summary"),
});

export const EMAIL_STATUSES = ["preview", "queued", "sent", "failed", "discarded"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Every acknowledgement / routing email, previewed, sent or failed (SPEC §25, [G9]). */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<"acknowledgement" | "routing">().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    reference: text("reference"),
    to: text("to").array().notNull(),
    cc: text("cc").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    attachSlip: integer("attach_slip").notNull().default(1),
    blobPathname: text("blob_pathname"),
    status: text("status").$type<EmailStatus>().notNull(),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdBy: uuid("created_by"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentByName: text("sent_by_name"),
  },
  (t) => [index("email_messages_entity_idx").on(t.entityType, t.entityId), index("email_messages_status_idx").on(t.status)],
);
