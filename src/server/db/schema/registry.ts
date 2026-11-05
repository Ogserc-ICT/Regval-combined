/**
 * The Inward Register (SPEC §19; docs/PLAN.md §3.4). Every OGSERC/ACK number
 * lives here, whether issued by New Inward, Registry Intake or a direct
 * Register / Own-Use entry, with the front desk, outward items and files.
 */
import { type AnyPgColumn, bigint, boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { correspondenceTypes, signatories, units } from "./reference";

export const INWARD_SOURCES = ["new_inward", "registry_intake", "register_direct", "own_use_direct", "import"] as const;
export type InwardSource = (typeof INWARD_SOURCES)[number];

export const inwardItems = pgTable(
  "inward_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ackNo: text("ack_no").notNull().unique(),
    ackYear: integer("ack_year").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    mode: text("mode").notNull(),
    /** Frozen at save (para 10(3)); sets the ACK year and the days late (Q3). */
    deemedReceiptDate: date("deemed_receipt_date", { mode: "string" }).notNull(),
    correspondenceTypeId: uuid("correspondence_type_id").references(() => correspondenceTypes.id),
    sender: text("sender").notNull(),
    senderCategory: text("sender_category"),
    senderRef: text("sender_ref"),
    documentDate: date("document_date", { mode: "string" }),
    subject: text("subject").notNull(),
    cacNo: text("cac_no"),
    relatedOgsercNo: text("related_ogserc_no"),
    inResponseToOutwardId: uuid("in_response_to_outward_id").references((): AnyPgColumn => outwardItems.id),
    lga: text("lga"),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    deliveredBy: text("delivered_by"),
    volumes: integer("volumes"),
    schedule2Count: integer("schedule2_count"),
    feeEvidence: boolean("fee_evidence"),
    paymentReference: text("payment_reference"),
    amountShownKobo: bigint("amount_shown_kobo", { mode: "number" }),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id),
    /** Import only: a typed name kept as found ([G6]). */
    receivedByPlaceholder: text("received_by_placeholder"),
    ackIssuedVia: text("ack_issued_via"),
    fileId: uuid("file_id").references((): AnyPgColumn => files.id),
    unitOverrideId: uuid("unit_override_id").references(() => units.id),
    actionRequired: text("action_required"),
    priority: text("priority"),
    actionOfficer: text("action_officer"),
    responseDueOverride: date("response_due_override", { mode: "string" }),
    routedByUserId: uuid("routed_by_user_id").references(() => users.id),
    routedAt: timestamp("routed_at", { withTimezone: true }),
    forwardedOn: date("forwarded_on", { mode: "string" }),
    /** The receiving unit officer, typed at forwarding or set by "Confirm receipt". */
    unitOfficerReceivedBy: text("unit_officer_received_by"),
    unitReceivedByUserId: uuid("unit_received_by_user_id").references(() => users.id),
    unitReceivedAt: timestamp("unit_received_at", { withTimezone: true }),
    closedManualOn: date("closed_manual_on", { mode: "string" }),
    ackEmailedTo: text("ack_emailed_to"),
    ackEmailedAt: timestamp("ack_emailed_at", { withTimezone: true }),
    frontDeskItemId: uuid("front_desk_item_id").unique().references((): AnyPgColumn => frontDeskItems.id),
    source: text("source").$type<InwardSource>().notNull(),
    remarks: text("remarks"),
    isExample: boolean("is_example").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inward_items_deemed_idx").on(t.deemedReceiptDate),
    index("inward_items_type_idx").on(t.correspondenceTypeId),
    index("inward_items_outward_idx").on(t.inResponseToOutwardId),
    index("inward_items_file_idx").on(t.fileId),
  ],
);

/** Front Desk Log (SPEC §17). No acknowledgement; the Registry registers it later. */
export const frontDeskItems = pgTable("front_desk_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  fdNo: text("fd_no").notNull().unique(),
  fdYear: integer("fd_year").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  sender: text("sender").notNull(),
  subject: text("subject").notNull(),
  correspondenceTypeId: uuid("correspondence_type_id").references(() => correspondenceTypes.id),
  mode: text("mode").notNull(),
  deliveredBy: text("delivered_by"),
  phone: text("phone"),
  volumes: integer("volumes"),
  receivedByUserId: uuid("received_by_user_id").references(() => users.id),
  receivedByName: text("received_by_name"),
  remarks: text("remarks"),
  /** Set once, when the Registry registers it (New Inward or Registry Intake). */
  inwardItemId: uuid("inward_item_id").unique().references((): AnyPgColumn => inwardItems.id),
  registeredAt: timestamp("registered_at", { withTimezone: true }),
  isExample: boolean("is_example").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Outward Register (SPEC §21). */
export const outwardItems = pgTable(
  "outward_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outNo: text("out_no").notNull().unique(),
    outYear: integer("out_year").notNull(),
    documentDate: date("document_date", { mode: "string" }).notNull(),
    documentType: text("document_type").notNull(),
    subject: text("subject").notNull(),
    addressee: text("addressee").notNull(),
    recipientCategory: text("recipient_category").notNull(),
    recipientContact: text("recipient_contact"),
    inReplyToInwardId: uuid("in_reply_to_inward_id").references(() => inwardItems.id),
    relatedOgsercNo: text("related_ogserc_no"),
    fileId: uuid("file_id").references((): AnyPgColumn => files.id),
    originatingUnitId: uuid("originating_unit_id").notNull().references(() => units.id),
    preparedBy: text("prepared_by"),
    signatoryId: uuid("signatory_id").references(() => signatories.id),
    /** Kept as signed, so a later change to the signatory list does not rewrite history. */
    signatoryName: text("signatory_name").notNull(),
    signatoryDesignation: text("signatory_designation"),
    dispatchMode: text("dispatch_mode").notNull(),
    dispatchedOn: date("dispatched_on", { mode: "string" }),
    dispatchedByUserId: uuid("dispatched_by_user_id").references(() => users.id),
    trackingRef: text("tracking_ref"),
    deliveryConfirmed: boolean("delivery_confirmed").notNull().default(false),
    deliveredOn: date("delivered_on", { mode: "string" }),
    receivedByRecipient: text("received_by_recipient"),
    /** null = the document type's default. */
    responseExpected: boolean("response_expected"),
    responseDueOverride: date("response_due_override", { mode: "string" }),
    remarks: text("remarks"),
    isExample: boolean("is_example").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outward_items_reply_idx").on(t.inReplyToInwardId), index("outward_items_file_idx").on(t.fileId)],
);

/** File Index (SPEC §22). */
export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileRef: text("file_ref").notNull().unique(),
  title: text("title").notNull(),
  fileClass: text("file_class").notNull(),
  owningUnitId: uuid("owning_unit_id").references(() => units.id),
  openedOn: date("opened_on", { mode: "string" }).notNull(),
  currentVolume: integer("current_volume").notNull().default(1),
  security: text("security").notNull().default("Open"),
  status: text("status").notNull().default("Open"),
  closedOn: date("closed_on", { mode: "string" }),
  remarks: text("remarks"),
  isExample: boolean("is_example").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** File Movement (SPEC §22). */
export const fileMovements = pgTable(
  "file_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id").notNull().references(() => files.id),
    outAt: timestamp("out_at", { withTimezone: true }).notNull(),
    volume: integer("volume"),
    releasedByUserId: uuid("released_by_user_id").references(() => users.id),
    releasedByName: text("released_by_name"),
    /** Free text: files move to any staff member, not only app users (Q17). */
    issuedTo: text("issued_to").notNull(),
    unitId: uuid("unit_id").notNull().references(() => units.id),
    purpose: text("purpose"),
    returnByOverride: date("return_by_override", { mode: "string" }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    receivedBackByUserId: uuid("received_back_by_user_id").references(() => users.id),
    receivedBackByName: text("received_back_by_name"),
    remarks: text("remarks"),
    isExample: boolean("is_example").notNull().default(false),
  },
  (t) => [index("file_movements_file_idx").on(t.fileId, t.outAt)],
);
