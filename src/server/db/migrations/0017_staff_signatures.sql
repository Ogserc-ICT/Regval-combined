ALTER TABLE "users" ADD COLUMN "signature_path" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signature_updated_at" timestamp with time zone;