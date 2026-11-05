/**
 * Reference data (docs/PLAN.md §3.2), seeded from the workbook's Lists and
 * Registry Lists sheets. Admin-editable (screens in Phase 5); rows are
 * deactivated, not deleted, once used.
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, check, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Schedule 3 fee table (Lists A5:G16). Money in kobo. */
export const feeSchedule = pgTable("fee_schedule", {
  category: text("category").primaryKey(),
  registrationFee: bigint("registration_fee", { mode: "number" }).notNull(),
  lateInitial: bigint("late_initial", { mode: "number" }).notNull(),
  lateDaily: bigint("late_daily", { mode: "number" }).notNull(),
  lateCap: bigint("late_cap", { mode: "number" }).notNull(),
  /** Lists F: not used by any rule; kept as information. */
  lateTier: integer("late_tier"),
  description: text("description").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Activity → category map (Lists A19:F33). */
export const activities = pgTable("activities", {
  code: text("code").primaryKey(),
  name: text("name").notNull().unique(),
  cat10MwPlus: text("cat_10mw_plus").notNull(),
  cat1To10Mw: text("cat_1_to_10mw").notNull(),
  catBelow1Mw: text("cat_below_1mw").notNull(),
  capacityBased: boolean("capacity_based").notNull(),
  sort: integer("sort").notNull(),
  active: boolean("active").notNull().default(true),
});

/** Forms REG-01A to REG-01K (Lists A37:E48). */
export const forms = pgTable("forms", {
  form: text("form").primaryKey(),
  category: text("category").notNull().unique(),
  title: text("title").notNull(),
  orderPara: text("order_para").notNull(),
});

/** Schedule 2 documents per form (Lists I5:N129). */
export const formDocuments = pgTable(
  "form_documents",
  {
    form: text("form").notNull(),
    key: text("key").notNull(),
    no: integer("no").notNull(),
    document: text("document").notNull(),
    /** Condition key: the document is N/A when that condition is N. */
    requiredWhen: text("required_when"),
  },
  (t) => [primaryKey({ columns: [t.form, t.key] })],
);

/** Document conditions (Lists A52:C61). */
export const documentConditions = pgTable("document_conditions", {
  key: text("key").primaryKey(),
  question: text("question").notNull(),
  sort: integer("sort").notNull(),
});

/** EVAL-01 checks (Lists Q5:T68). */
export const evalChecks = pgTable("eval_checks", {
  id: text("id").primaryKey(),
  stage: text("stage").notNull(),
  text: text("text").notNull(),
  ruleText: text("rule_text").notNull(),
  sort: integer("sort").notNull(),
});

/** Simple drop-down lists (registrant types, licence statuses, LGAs, channels …). */
export const listItems = pgTable(
  "list_items",
  {
    listKey: text("list_key").notNull(),
    value: text("value").notNull(),
    sort: integer("sort").notNull(),
    active: boolean("active").notNull().default(true),
    /** e.g. the Register channel a mode of receipt maps to. */
    meta: text("meta"),
  },
  (t) => [primaryKey({ columns: [t.listKey, t.value] })],
);

export const SIGNATORY_ROLES = ["chairman_ceo", "commissioner", "secretary", "other"] as const;
export type SignatoryRole = (typeof SIGNATORY_ROLES)[number];

/** One signatory list for certificates and outgoing letters ([G3]). */
export const signatories = pgTable(
  "signatories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    designation: text("designation").notNull(),
    role: text("role").$type<SignatoryRole>().notNull(),
    active: boolean("active").notNull().default(true),
    confirmed: boolean("confirmed").notNull().default(false),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("signatories_role_check", sql`${t.role} in ('chairman_ceo', 'commissioner', 'secretary', 'other')`)],
);

/** Divisions (Registry Lists AO:AP). Emails are mostly missing ([G9]). */
export const divisions = pgTable("divisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  email: text("email"),
  sort: integer("sort").notNull(),
});

/** Units (Registry Lists AJ:AM). */
export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  divisionId: uuid("division_id").references(() => divisions.id),
  unitGroup: text("unit_group"),
  email: text("email"),
  sort: integer("sort").notNull(),
  active: boolean("active").notNull().default(true),
});

/** Incoming correspondence types (Registry Lists A4:J35). */
export const correspondenceTypes = pgTable("correspondence_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  defaultUnitId: uuid("default_unit_id").references(() => units.id),
  orderRef: text("order_ref"),
  responseTargetDays: integer("response_target_days").notNull().default(0),
  para103Wording: boolean("para_10_3_wording").notNull().default(false),
  /** NEW | UPDATE | ANNUAL | OWNUSE when the type is a registration filing. */
  filingType: text("filing_type"),
  sort: integer("sort").notNull(),
  active: boolean("active").notNull().default(true),
});
