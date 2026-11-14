CREATE TABLE "handover_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_no" text NOT NULL,
	"prepared_at" timestamp with time zone NOT NULL,
	"prepared_by" uuid NOT NULL,
	"prepared_by_name" text NOT NULL,
	"payment_lines" integer NOT NULL,
	"reversal_lines" integer NOT NULL,
	"payment_total" bigint NOT NULL,
	"reversal_total" bigint NOT NULL,
	"net_total" bigint NOT NULL,
	"confirmed_from" date,
	"confirmed_to" date,
	"checksum" text NOT NULL,
	"lines" jsonb NOT NULL,
	"imported_on" date,
	"imported_by" uuid,
	"imported_by_name" text,
	"imported_at" timestamp with time zone,
	CONSTRAINT "handover_batches_batch_no_unique" UNIQUE("batch_no")
);
--> statement-breakpoint
CREATE TABLE "handover_lines" (
	"line_id" text PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"line_type" text NOT NULL,
	"batch_id" uuid NOT NULL,
	CONSTRAINT "handover_lines_type_check" CHECK ("handover_lines"."line_type" in ('Payment', 'Reversal'))
);
--> statement-breakpoint
ALTER TABLE "handover_batches" ADD CONSTRAINT "handover_batches_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_batches" ADD CONSTRAINT "handover_batches_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_lines" ADD CONSTRAINT "handover_lines_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_lines" ADD CONSTRAINT "handover_lines_batch_id_handover_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."handover_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handover_lines_payment_idx" ON "handover_lines" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "handover_lines_batch_idx" ON "handover_lines" USING btree ("batch_id");--> statement-breakpoint
-- Phase 11: payment handover to the Revenue Registry (docs/REVENUE-REGISTRY-CONTRACT.md).
-- A batch and its lines are never deleted (only Admin › Data management may) and never change
-- once prepared; only the "imported into the Revenue Registry" record may be added, once.
CREATE TRIGGER handover_batches_no_delete BEFORE DELETE ON handover_batches FOR EACH ROW EXECUTE FUNCTION reject_delete();--> statement-breakpoint
CREATE TRIGGER handover_lines_no_delete BEFORE DELETE ON handover_lines FOR EACH ROW EXECUTE FUNCTION reject_delete();--> statement-breakpoint
CREATE TRIGGER handover_batches_locked BEFORE UPDATE ON handover_batches
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('batch_no', 'prepared_at', 'prepared_by', 'payment_lines', 'reversal_lines', 'payment_total', 'reversal_total', 'net_total', 'confirmed_from', 'confirmed_to', 'checksum', 'lines', 'imported_on', 'imported_by', 'imported_at');--> statement-breakpoint
CREATE TRIGGER handover_lines_locked BEFORE UPDATE ON handover_lines
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('line_id', 'payment_id', 'line_type', 'batch_id');
