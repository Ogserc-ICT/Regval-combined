ALTER TABLE "deficiency_notices" ADD COLUMN "sent_on" date;--> statement-breakpoint
ALTER TABLE "deficiency_notices" ADD COLUMN "response_received_on" date;--> statement-breakpoint
ALTER TABLE "own_use_notifications" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "own_use_notifications" ADD COLUMN "submission_channel" text;--> statement-breakpoint
ALTER TABLE "own_use_notifications" ADD COLUMN "deemed_receipt_date" date;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "deemed_receipt_date" date;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "certificate_sent_on" date;--> statement-breakpoint
-- Phase 9 (Registry removed): the Register and Own-Use keep their own receipt facts, taken from
-- the inward item each was logged under. Courier, post and internal mail count as "By hand":
-- only Email and Online portal have the closing-time cut-off (Q1).
UPDATE "submissions" s SET
  "received_at" = i."received_at",
  "deemed_receipt_date" = i."deemed_receipt_date",
  "submission_channel" = coalesce(s."submission_channel", CASE i."mode" WHEN 'Email' THEN 'Email' WHEN 'Online portal' THEN 'Online portal' ELSE 'By hand' END)
FROM "inward_items" i WHERE i."id" = s."inward_item_id";--> statement-breakpoint
UPDATE "own_use_notifications" o SET
  "received_at" = i."received_at",
  "deemed_receipt_date" = i."deemed_receipt_date",
  "submission_channel" = CASE i."mode" WHEN 'Email' THEN 'Email' WHEN 'Online portal' THEN 'Online portal' ELSE 'By hand' END
FROM "inward_items" i WHERE i."id" = o."inward_item_id";--> statement-breakpoint
-- Notices already issued keep their clock: they count as sent on the day they were issued.
UPDATE "deficiency_notices" SET "sent_on" = "issued_on" WHERE "sent_on" IS NULL;
