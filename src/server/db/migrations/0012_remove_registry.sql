-- Phase 9: the Registry leaves this app (docs/PLAN.md §11g). Registration keeps its own receipt
-- facts (0011). Order matters: guards and links first, then the registry tables.

-- 1. Guards that name the inward link: recreate them without it, and lock the deemed receipt date
--    once issued (it sets the ACK year and the days late, as it did on the inward item).
DROP TRIGGER IF EXISTS "submissions_numbers_locked" ON "submissions";--> statement-breakpoint
CREATE TRIGGER "submissions_numbers_locked" BEFORE UPDATE ON "submissions"
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('ack_no', 'registration_no', 'deemed_receipt_date');--> statement-breakpoint
DROP TRIGGER IF EXISTS "own_use_numbers_locked" ON "own_use_notifications";--> statement-breakpoint
CREATE TRIGGER "own_use_numbers_locked" BEFORE UPDATE ON "own_use_notifications"
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('ack_no', 'oun_no', 'registration_no', 'deemed_receipt_date');--> statement-breakpoint
-- A deficiency notice's response period now runs from the date it was sent: the due date is set
-- when the sent date is recorded, and both are then locked.
DROP TRIGGER IF EXISTS "deficiency_notices_locked" ON "deficiency_notices";--> statement-breakpoint
CREATE TRIGGER "deficiency_notices_locked" BEFORE UPDATE ON "deficiency_notices"
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('def_no', 'issued_on', 'submission_id', 'sent_on', 'response_due', 'response_received_on');--> statement-breakpoint
ALTER TABLE "deficiency_notices" ALTER COLUMN "response_due" DROP NOT NULL;--> statement-breakpoint

-- 2. Links into the registry, then the receipt facts become required.
ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_inward_item_id_inward_items_id_fk";--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_inward_item_id_unique";--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "inward_item_id";--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "front_desk_item_id";--> statement-breakpoint
ALTER TABLE "own_use_notifications" DROP CONSTRAINT IF EXISTS "own_use_notifications_inward_item_id_inward_items_id_fk";--> statement-breakpoint
ALTER TABLE "own_use_notifications" DROP CONSTRAINT IF EXISTS "own_use_notifications_inward_item_id_unique";--> statement-breakpoint
ALTER TABLE "own_use_notifications" DROP COLUMN IF EXISTS "inward_item_id";--> statement-breakpoint
ALTER TABLE "own_use_notifications" DROP COLUMN IF EXISTS "front_desk_item_id";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_unit_id_units_id_fk";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "unit_id";--> statement-breakpoint
-- Rows 0011 could not fill (none expected): received at midnight Lagos on the date typed, by hand.
UPDATE "submissions" SET "received_at" = ("date_submitted"::timestamp AT TIME ZONE 'Africa/Lagos') WHERE "received_at" IS NULL;--> statement-breakpoint
UPDATE "submissions" SET "submission_channel" = 'By hand' WHERE "submission_channel" IS NULL;--> statement-breakpoint
UPDATE "submissions" SET "deemed_receipt_date" = "date_submitted" WHERE "deemed_receipt_date" IS NULL;--> statement-breakpoint
UPDATE "own_use_notifications" SET "received_at" = ("date_filed"::timestamp AT TIME ZONE 'Africa/Lagos') WHERE "received_at" IS NULL;--> statement-breakpoint
UPDATE "own_use_notifications" SET "submission_channel" = 'By hand' WHERE "submission_channel" IS NULL;--> statement-breakpoint
UPDATE "own_use_notifications" SET "deemed_receipt_date" = "date_filed" WHERE "deemed_receipt_date" IS NULL;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "received_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "submission_channel" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "deemed_receipt_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "own_use_notifications" ALTER COLUMN "received_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "own_use_notifications" ALTER COLUMN "submission_channel" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "own_use_notifications" ALTER COLUMN "deemed_receipt_date" SET NOT NULL;--> statement-breakpoint

-- 3. The registry's own tables, and registry-only reference data.
DROP TABLE IF EXISTS "file_movements", "files", "outward_items", "inward_items", "front_desk_items",
  "email_messages", "import_runs", "correspondence_types", "units", "divisions" CASCADE;--> statement-breakpoint
DELETE FROM "list_items" WHERE "list_key" IN ('registry_lga', 'ack_issued_via', 'sender_category', 'action_required',
  'priority', 'security', 'file_status', 'mode_of_receipt', 'file_class', 'outgoing_type');--> statement-breakpoint

-- 4. Roles: a Registry officer becomes a Registration officer; the other registry roles go.
--    The allowed roles are checked by the database (0001), so the check changes with them.
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_role_check";--> statement-breakpoint
UPDATE "user_roles" SET "role" = 'registration' WHERE "role" = 'registry';--> statement-breakpoint
DELETE FROM "user_roles" WHERE "role" IN ('front_desk', 'router', 'unit_officer');--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_check" CHECK (
  "role" IN ('registration', 'evaluator', 'supervisor', 'approver', 'finance', 'admin', 'viewer')
);--> statement-breakpoint

-- 5. Settings: the registry targets and acknowledgement email go; the letter address is renamed.
DELETE FROM "settings" WHERE "key" IN ('forwardingTargetDays', 'dispatchTargetDays', 'podChaseDays', 'urgentResponseDays',
  'defaultResponseDays', 'fileReturnDays', 'ackEmailMode', 'ackEmailCc');--> statement-breakpoint
UPDATE "settings" SET "key" = 'letterAddress' WHERE "key" = 'registryAddress';--> statement-breakpoint

-- 6. Number series FD, OUT and file references are no longer issued. (Counters are guarded against
--    deletion; the guard is set aside for this one statement.)
ALTER TABLE "counters" DISABLE TRIGGER "counters_no_delete";--> statement-breakpoint
DELETE FROM "counters" WHERE "series" IN ('FD', 'OUT', 'FILE');--> statement-breakpoint
ALTER TABLE "counters" ENABLE TRIGGER "counters_no_delete";--> statement-breakpoint

-- 7. Notifications about registry work.
DELETE FROM "notifications" WHERE "kind" LIKE 'frontdesk:%' OR "kind" LIKE 'inward:%';
