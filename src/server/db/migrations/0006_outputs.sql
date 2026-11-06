CREATE TABLE "daily_review_runs" (
	"lagos_date" date PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"trigger" text NOT NULL,
	"user_id" uuid,
	"user_name" text,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text,
	"to" text[] NOT NULL,
	"cc" text[] DEFAULT '{}'::text[] NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"attach_slip" integer DEFAULT 1 NOT NULL,
	"blob_pathname" text,
	"status" text NOT NULL,
	"provider" text,
	"provider_message_id" text,
	"error" text,
	"created_by" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_by_name" text
);
--> statement-breakpoint
CREATE INDEX "email_messages_entity_idx" ON "email_messages" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "email_messages_status_idx" ON "email_messages" USING btree ("status");