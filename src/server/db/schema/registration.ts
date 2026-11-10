/**
 * Registration records (SPEC §6–§16; docs/PLAN.md §3.5).
 * Money in kobo; dates as Lagos calendar dates ("YYYY-MM-DD").
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const FILING_CODES = ["NEW", "UPDATE", "ANNUAL"] as const;
export type FilingCode = (typeof FILING_CODES)[number];

export const STATUSES = [
  "Acknowledged - Awaiting Payment",
  "Received - Under Review",
  "Deficiency Notice Issued",
  "Provisionally Registered",
  "Registered",
  "Lapsed",
  "Refused",
  "Cancelled",
  "Changes Applied",
] as const;
export type SubmissionStatus = (typeof STATUSES)[number];

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ackNo: text("ack_no").notNull().unique(),
    /** null = not yet saved (kept for rows created before Phase 9; every save sets it now). */
    status: text("status").$type<SubmissionStatus>(),
    filingType: text("filing_type").$type<FilingCode>().notNull(),
    formFiled: text("form_filed"),
    linkedSubmissionId: uuid("linked_submission_id"),
    linkedRegistrationNo: text("linked_registration_no"),
    registeredName: text("registered_name").notNull(),
    tradingName: text("trading_name"),
    /** The Lagos date received (the date part of receivedAt). */
    dateSubmitted: date("date_submitted", { mode: "string" }).notNull(),
    /** When the filing was received, and how (By hand, Email, Online portal). */
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    submissionChannel: text("submission_channel").notNull(),
    /** Para 10(3), computed on first save and then fixed: sets the ACK year and the days late (Q3). */
    deemedReceiptDate: date("deemed_receipt_date", { mode: "string" }).notNull(),
    registrantType: text("registrant_type"),
    cacNo: text("cac_no"),
    tin: text("tin"),
    registeredAddress: text("registered_address"),
    principalLga: text("principal_lga"),
    otherLgas: text("other_lgas"),
    townsEstates: text("towns_estates"),
    primaryActivity: text("primary_activity"),
    installedCapacityMw: doublePrecision("installed_capacity_mw"),
    customers: integer("customers"),
    licenceStatus: text("licence_status"),
    complianceOfficer: text("compliance_officer"),
    phone: text("phone"),
    email: text("email"),
    /** "Y" | "N" */
    operatingOnEffectiveDate: text("operating_on_effective_date"),
    plannedStartDate: date("planned_start_date", { mode: "string" }),
    approvedWaiver: bigint("approved_waiver", { mode: "number" }).notNull().default(0),
    categoryOverride: text("category_override"),
    overrideReason: text("override_reason"),
    // Document conditions: null = applies (blank), true = Y, false = N.
    condMultiState: boolean("cond_multi_state"),
    condGenerationForSale: boolean("cond_generation_for_sale"),
    condGridConnected: boolean("cond_grid_connected"),
    condInterconnectedMinigrid: boolean("cond_interconnected_minigrid"),
    condFDistribution: boolean("cond_f_distribution"),
    condFTrading: boolean("cond_f_trading"),
    condDiscoBulkSupply: boolean("cond_disco_bulk_supply"),
    condSubFranchise: boolean("cond_sub_franchise"),
    formSectionsNotComplete: text("form_sections_not_complete"),
    capacityInSectionsMw: doublePrecision("capacity_in_sections_mw"),
    confirmedCategory: text("confirmed_category"),
    categoryConfirmedReason: text("category_confirmed_reason"),
    releasedOn: date("released_on", { mode: "string" }),
    dateSubmissionComplete: date("date_submission_complete", { mode: "string" }),
    deficiencyNoticeDate: date("deficiency_notice_date", { mode: "string" }),
    showCauseDate: date("show_cause_date", { mode: "string" }),
    certificateIssueDate: date("certificate_issue_date", { mode: "string" }),
    /** The date the certificate was actually sent to the registrant. */
    certificateSentOn: date("certificate_sent_on", { mode: "string" }),
    registrationNo: text("registration_no").unique(),
    certificateNeedsReissue: boolean("certificate_needs_reissue").notNull().default(false),
    remarks: text("remarks"),
    // Pricing snapshot, frozen at save (SPEC §8.3)
    pricedCategory: text("priced_category"),
    pricedFee: bigint("priced_fee", { mode: "number" }),
    pricedLateInitial: bigint("priced_late_initial", { mode: "number" }),
    pricedLateDaily: bigint("priced_late_daily", { mode: "number" }),
    pricedLateCap: bigint("priced_late_cap", { mode: "number" }),
    pricedDeadline: date("priced_deadline", { mode: "string" }),
    pricedEffectiveDate: date("priced_effective_date", { mode: "string" }),
    createdBy: uuid("created_by").references(() => users.id),
    createdByName: text("created_by_name"),
    savedAt: timestamp("saved_at", { withTimezone: true }),
    isExample: boolean("is_example").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("submissions_status_idx").on(t.status),
    index("submissions_cac_idx").on(sql`lower(trim(${t.cacNo}))`),
    index("submissions_linked_idx").on(t.linkedSubmissionId),
    check("submissions_waiver_check", sql`${t.approvedWaiver} >= 0`),
  ],
);

export const submissionOtherActivities = pgTable(
  "submission_other_activities",
  {
    submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    activity: text("activity").notNull(),
  },
  (t) => [primaryKey({ columns: [t.submissionId, t.position] })],
);

export const submissionLicences = pgTable(
  "submission_licences",
  {
    submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    licenceNo: text("licence_no"),
    expiryDate: date("expiry_date", { mode: "string" }),
  },
  (t) => [primaryKey({ columns: [t.submissionId, t.position] })],
);

export const evaluations = pgTable("evaluations", {
  submissionId: uuid("submission_id").primaryKey().references(() => submissions.id, { onDelete: "cascade" }),
  evaluatingOfficerId: uuid("evaluating_officer_id").references(() => users.id),
  reviewingSupervisorId: uuid("reviewing_supervisor_id").references(() => users.id),
  approvingOfficerId: uuid("approving_officer_id").references(() => users.id),
  startedOn: date("started_on", { mode: "string" }),
  flagOverrideReason: text("flag_override_reason"),
  finalDecision: text("final_decision"),
  reasons: text("reasons"),
  reviewDate: date("review_date", { mode: "string" }),
  approvalDate: date("approval_date", { mode: "string" }),
  remarks: text("remarks"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationAnswers = pgTable(
  "evaluation_answers",
  {
    submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    checkId: text("check_id").notNull(),
    /** "Y" | "N" | "N/A" */
    value: text("value").notNull(),
    answeredBy: uuid("answered_by").references(() => users.id),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.submissionId, t.checkId] }), check("evaluation_answers_value_check", sql`${t.value} in ('Y', 'N', 'N/A')`)],
);

export const OWNER_TYPES = ["submission", "own_use"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

/** Schedule 2 checklist entries (Documents sheet). Missing row = pending. */
export const documentChecklist = pgTable(
  "document_checklist",
  {
    ownerType: text("owner_type").$type<OwnerType>().notNull(),
    ownerId: uuid("owner_id").notNull(),
    key: text("key").notNull(),
    form: text("form").notNull(),
    /** "Y" | "N" | "N/A" | null (pending) */
    value: text("value"),
    remarks: text("remarks"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerType, t.ownerId, t.key] })],
);

export const FINANCE_STATUSES = ["Pending", "Confirmed", "Rejected"] as const;
export type FinanceStatus = (typeof FINANCE_STATUSES)[number];

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payNo: text("pay_no").notNull().unique(),
    dateReceived: date("date_received", { mode: "string" }).notNull(),
    ownerType: text("owner_type").$type<OwnerType>().notNull(),
    ownerId: uuid("owner_id").notNull(),
    /** The ACK or OUN quoted (denormalised for display and search). */
    reference: text("reference").notNull(),
    purpose: text("purpose"),
    channel: text("channel"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    rrr: text("rrr"),
    recordedBy: uuid("recorded_by").notNull().references(() => users.id),
    recordedByName: text("recorded_by_name").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    financeStatus: text("finance_status").$type<FinanceStatus>().notNull().default("Pending"),
    verifiedWithBank: boolean("verified_with_bank").notNull().default(false),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedByName: text("decided_by_name"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    financeRemarks: text("finance_remarks"),
    reversed: boolean("reversed").notNull().default(false),
    reversedBy: uuid("reversed_by").references(() => users.id),
    reversedByName: text("reversed_by_name"),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversalReason: text("reversal_reason"),
    isExample: boolean("is_example").notNull().default(false),
  },
  (t) => [
    index("payments_owner_idx").on(t.ownerType, t.ownerId),
    index("payments_rrr_idx").on(sql`lower(trim(${t.rrr}))`),
    check("payments_amount_check", sql`${t.amount} > 0`),
    check("payments_status_check", sql`${t.financeStatus} in ('Pending', 'Confirmed', 'Rejected')`),
  ],
);

export const deficiencyNotices = pgTable("deficiency_notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id),
  defNo: text("def_no").notNull().unique(),
  issuedOn: date("issued_on", { mode: "string" }).notNull(),
  /** Sent date + the deficiency response period; empty until the notice is sent. */
  responseDue: date("response_due", { mode: "string" }),
  documentsOutstanding: integer("documents_outstanding").notNull(),
  balance: bigint("balance", { mode: "number" }).notNull(),
  checksFailed: integer("checks_failed").notNull(),
  issuedBy: uuid("issued_by").references(() => users.id),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  /** The date the notice was actually sent; the response period runs from it. */
  sentOn: date("sent_on", { mode: "string" }),
  /** The date the registrant's response arrived (asked for by "Mark complete"). */
  responseReceivedOn: date("response_received_on", { mode: "string" }),
});

export const ownUseNotifications = pgTable(
  "own_use_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ackNo: text("ack_no").notNull().unique(),
    /** null until saved. */
    ounNo: text("oun_no").unique(),
    name: text("name").notNull(),
    /** The Lagos date received (the date part of receivedAt). */
    dateFiled: date("date_filed", { mode: "string" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    submissionChannel: text("submission_channel").notNull(),
    /** Para 10(3), computed on first save and then fixed: sets the ACK year. */
    deemedReceiptDate: date("deemed_receipt_date", { mode: "string" }).notNull(),
    cacNo: text("cac_no"),
    siteAddress: text("site_address"),
    lga: text("lga"),
    natureOfBusiness: text("nature_of_business"),
    gridConnected: text("grid_connected"),
    distributionLicensee: text("distribution_licensee"),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    flagOverrideReason: text("flag_override_reason"),
    remarks: text("remarks"),
    createdBy: uuid("created_by").references(() => users.id),
    createdByName: text("created_by_name"),
    pricedFee: bigint("priced_fee", { mode: "number" }),
    pricedThresholdKw: doublePrecision("priced_threshold_kw"),
    registrationNo: text("registration_no").unique(),
    certificateIssueDate: date("certificate_issue_date", { mode: "string" }),
    registeredBy: uuid("registered_by").references(() => users.id),
    savedAt: timestamp("saved_at", { withTimezone: true }),
    isExample: boolean("is_example").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("own_use_cac_idx").on(sql`lower(trim(${t.cacNo}))`)],
);

export const ownUseUnits = pgTable(
  "own_use_units",
  {
    notificationId: uuid("notification_id").notNull().references(() => ownUseNotifications.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    makeModel: text("make_model"),
    kw: doublePrecision("kw").notNull(),
    fuel: text("fuel"),
    avgMwh: doublePrecision("avg_mwh"),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.position] }), check("own_use_units_kw_check", sql`${t.kw} > 0`)],
);
