CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"user_name" text NOT NULL,
	"source_name" text NOT NULL,
	"sha256" text NOT NULL,
	"mode" text NOT NULL,
	"dry_run" integer NOT NULL,
	"report" jsonb NOT NULL
);
