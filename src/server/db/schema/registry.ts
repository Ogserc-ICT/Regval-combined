/**
 * The Inward Register (SPEC §19; docs/PLAN.md §3.4). Every OGSERC/ACK number
 * lives here, whether issued by New Inward, Registry Intake or a direct
 * Register / Own-Use entry. Phase 2 uses it for direct entries; Phase 3
 * adds the registry screens, routing, front desk, outward and files.
 */
import { bigint, boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { correspondenceTypes, units } from "./reference";

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
    inResponseToOutwardId: uuid("in_response_to_outward_id"),
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
    fileId: uuid("file_id"),
    unitOverrideId: uuid("unit_override_id").references(() => units.id),
    actionRequired: text("action_required"),
    priority: text("priority"),
    actionOfficer: text("action_officer"),
    responseDueOverride: date("response_due_override", { mode: "string" }),
    routedByUserId: uuid("routed_by_user_id").references(() => users.id),
    routedAt: timestamp("routed_at", { withTimezone: true }),
    forwardedOn: date("forwarded_on", { mode: "string" }),
    unitOfficerReceivedBy: text("unit_officer_received_by"),
    unitReceivedAt: timestamp("unit_received_at", { withTimezone: true }),
    closedManualOn: date("closed_manual_on", { mode: "string" }),
    ackEmailedTo: text("ack_emailed_to"),
    ackEmailedAt: timestamp("ack_emailed_at", { withTimezone: true }),
    frontDeskItemId: uuid("front_desk_item_id"),
    source: text("source").$type<InwardSource>().notNull(),
    remarks: text("remarks"),
    isExample: boolean("is_example").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inward_items_deemed_idx").on(t.deemedReceiptDate), index("inward_items_type_idx").on(t.correspondenceTypeId)],
);
