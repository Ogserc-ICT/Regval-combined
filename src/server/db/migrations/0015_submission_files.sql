CREATE TABLE "submission_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"blob_path" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_by_name" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by" uuid,
	"removed_by_name" text,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	CONSTRAINT "submission_files_blob_path_unique" UNIQUE("blob_path"),
	CONSTRAINT "submission_files_kind_check" CHECK ("submission_files"."kind" in ('Filed form', 'Supporting document', 'Other'))
);
--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_files_submission_idx" ON "submission_files" USING btree ("submission_id");--> statement-breakpoint
-- Filed forms and scans kept with a submission. Staff never delete a row ("Remove" deletes the
-- stored file and records who and why); only the admin data tools may, as for the other tables.
CREATE TRIGGER submission_files_no_delete BEFORE DELETE ON submission_files FOR EACH ROW EXECUTE FUNCTION reject_delete();--> statement-breakpoint
CREATE TRIGGER submission_files_locked BEFORE UPDATE ON submission_files
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('submission_id', 'kind', 'file_name', 'content_type', 'size_bytes', 'blob_path', 'uploaded_by', 'uploaded_at', 'removed_at', 'removed_by', 'removed_reason');
