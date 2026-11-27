ALTER TABLE "signatories" ADD COLUMN "signature_path" text;--> statement-breakpoint
ALTER TABLE "signatories" ADD COLUMN "signature_updated_at" timestamp with time zone;