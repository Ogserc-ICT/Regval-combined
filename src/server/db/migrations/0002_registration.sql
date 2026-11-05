CREATE TABLE "activities" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cat_10mw_plus" text NOT NULL,
	"cat_1_to_10mw" text NOT NULL,
	"cat_below_1mw" text NOT NULL,
	"capacity_based" boolean NOT NULL,
	"sort" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "activities_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "correspondence_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"default_unit_id" uuid,
	"order_ref" text,
	"response_target_days" integer DEFAULT 0 NOT NULL,
	"para_10_3_wording" boolean DEFAULT false NOT NULL,
	"filing_type" text,
	"sort" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "correspondence_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"sort" integer NOT NULL,
	CONSTRAINT "divisions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "document_conditions" (
	"key" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"sort" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"text" text NOT NULL,
	"rule_text" text NOT NULL,
	"sort" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_schedule" (
	"category" text PRIMARY KEY NOT NULL,
	"registration_fee" bigint NOT NULL,
	"late_initial" bigint NOT NULL,
	"late_daily" bigint NOT NULL,
	"late_cap" bigint NOT NULL,
	"late_tier" integer,
	"description" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_documents" (
	"form" text NOT NULL,
	"key" text NOT NULL,
	"no" integer NOT NULL,
	"document" text NOT NULL,
	"required_when" text,
	CONSTRAINT "form_documents_form_key_pk" PRIMARY KEY("form","key")
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"form" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"order_para" text NOT NULL,
	CONSTRAINT "forms_category_unique" UNIQUE("category")
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"list_key" text NOT NULL,
	"value" text NOT NULL,
	"sort" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"meta" text,
	CONSTRAINT "list_items_list_key_value_pk" PRIMARY KEY("list_key","value")
);
--> statement-breakpoint
CREATE TABLE "signatories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"designation" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signatories_role_check" CHECK ("signatories"."role" in ('chairman_ceo', 'commissioner', 'secretary', 'other'))
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"division_id" uuid,
	"unit_group" text,
	"email" text,
	"sort" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "units_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "inward_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ack_no" text NOT NULL,
	"ack_year" integer NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"deemed_receipt_date" date NOT NULL,
	"correspondence_type_id" uuid,
	"sender" text NOT NULL,
	"sender_category" text,
	"sender_ref" text,
	"document_date" date,
	"subject" text NOT NULL,
	"cac_no" text,
	"related_ogserc_no" text,
	"in_response_to_outward_id" uuid,
	"lga" text,
	"contact_person" text,
	"phone" text,
	"email" text,
	"delivered_by" text,
	"volumes" integer,
	"schedule2_count" integer,
	"fee_evidence" boolean,
	"payment_reference" text,
	"amount_shown_kobo" bigint,
	"received_by_user_id" uuid,
	"received_by_placeholder" text,
	"ack_issued_via" text,
	"file_id" uuid,
	"unit_override_id" uuid,
	"action_required" text,
	"priority" text,
	"action_officer" text,
	"response_due_override" date,
	"routed_by_user_id" uuid,
	"routed_at" timestamp with time zone,
	"forwarded_on" date,
	"unit_officer_received_by" text,
	"unit_received_at" timestamp with time zone,
	"closed_manual_on" date,
	"ack_emailed_to" text,
	"ack_emailed_at" timestamp with time zone,
	"front_desk_item_id" uuid,
	"source" text NOT NULL,
	"remarks" text,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inward_items_ack_no_unique" UNIQUE("ack_no")
);
--> statement-breakpoint
CREATE TABLE "deficiency_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"def_no" text NOT NULL,
	"issued_on" date NOT NULL,
	"response_due" date NOT NULL,
	"documents_outstanding" integer NOT NULL,
	"balance" bigint NOT NULL,
	"checks_failed" integer NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deficiency_notices_def_no_unique" UNIQUE("def_no")
);
--> statement-breakpoint
CREATE TABLE "document_checklist" (
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"key" text NOT NULL,
	"form" text NOT NULL,
	"value" text,
	"remarks" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_checklist_owner_type_owner_id_key_pk" PRIMARY KEY("owner_type","owner_id","key")
);
--> statement-breakpoint
CREATE TABLE "evaluation_answers" (
	"submission_id" uuid NOT NULL,
	"check_id" text NOT NULL,
	"value" text NOT NULL,
	"answered_by" uuid,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_answers_submission_id_check_id_pk" PRIMARY KEY("submission_id","check_id"),
	CONSTRAINT "evaluation_answers_value_check" CHECK ("evaluation_answers"."value" in ('Y', 'N', 'N/A'))
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"submission_id" uuid PRIMARY KEY NOT NULL,
	"evaluating_officer_id" uuid,
	"reviewing_supervisor_id" uuid,
	"approving_officer_id" uuid,
	"started_on" date,
	"flag_override_reason" text,
	"final_decision" text,
	"reasons" text,
	"review_date" date,
	"approval_date" date,
	"remarks" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "own_use_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inward_item_id" uuid NOT NULL,
	"ack_no" text NOT NULL,
	"oun_no" text,
	"name" text NOT NULL,
	"date_filed" date NOT NULL,
	"cac_no" text,
	"site_address" text,
	"lga" text,
	"nature_of_business" text,
	"grid_connected" text,
	"distribution_licensee" text,
	"contact_person" text,
	"phone" text,
	"email" text,
	"flag_override_reason" text,
	"remarks" text,
	"created_by" uuid,
	"created_by_name" text,
	"priced_fee" bigint,
	"priced_threshold_kw" double precision,
	"registration_no" text,
	"certificate_issue_date" date,
	"registered_by" uuid,
	"front_desk_item_id" uuid,
	"saved_at" timestamp with time zone,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "own_use_notifications_inward_item_id_unique" UNIQUE("inward_item_id"),
	CONSTRAINT "own_use_notifications_ack_no_unique" UNIQUE("ack_no"),
	CONSTRAINT "own_use_notifications_oun_no_unique" UNIQUE("oun_no"),
	CONSTRAINT "own_use_notifications_registration_no_unique" UNIQUE("registration_no")
);
--> statement-breakpoint
CREATE TABLE "own_use_units" (
	"notification_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"make_model" text,
	"kw" double precision NOT NULL,
	"fuel" text,
	"avg_mwh" double precision,
	CONSTRAINT "own_use_units_notification_id_position_pk" PRIMARY KEY("notification_id","position"),
	CONSTRAINT "own_use_units_kw_check" CHECK ("own_use_units"."kw" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pay_no" text NOT NULL,
	"date_received" date NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"purpose" text,
	"channel" text,
	"amount" bigint NOT NULL,
	"rrr" text,
	"recorded_by" uuid NOT NULL,
	"recorded_by_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"finance_status" text DEFAULT 'Pending' NOT NULL,
	"verified_with_bank" boolean DEFAULT false NOT NULL,
	"decided_by" uuid,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	"finance_remarks" text,
	"reversed" boolean DEFAULT false NOT NULL,
	"reversed_by" uuid,
	"reversed_by_name" text,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	"is_example" boolean DEFAULT false NOT NULL,
	CONSTRAINT "payments_pay_no_unique" UNIQUE("pay_no"),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_status_check" CHECK ("payments"."finance_status" in ('Pending', 'Confirmed', 'Rejected'))
);
--> statement-breakpoint
CREATE TABLE "submission_licences" (
	"submission_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"licence_no" text,
	"expiry_date" date,
	CONSTRAINT "submission_licences_submission_id_position_pk" PRIMARY KEY("submission_id","position")
);
--> statement-breakpoint
CREATE TABLE "submission_other_activities" (
	"submission_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"activity" text NOT NULL,
	CONSTRAINT "submission_other_activities_submission_id_position_pk" PRIMARY KEY("submission_id","position")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inward_item_id" uuid NOT NULL,
	"ack_no" text NOT NULL,
	"status" text,
	"filing_type" text NOT NULL,
	"form_filed" text,
	"linked_submission_id" uuid,
	"linked_registration_no" text,
	"registered_name" text NOT NULL,
	"trading_name" text,
	"date_submitted" date NOT NULL,
	"submission_channel" text,
	"registrant_type" text,
	"cac_no" text,
	"tin" text,
	"registered_address" text,
	"principal_lga" text,
	"other_lgas" text,
	"towns_estates" text,
	"primary_activity" text,
	"installed_capacity_mw" double precision,
	"customers" integer,
	"licence_status" text,
	"compliance_officer" text,
	"phone" text,
	"email" text,
	"operating_on_effective_date" text,
	"planned_start_date" date,
	"approved_waiver" bigint DEFAULT 0 NOT NULL,
	"category_override" text,
	"override_reason" text,
	"cond_multi_state" boolean,
	"cond_generation_for_sale" boolean,
	"cond_grid_connected" boolean,
	"cond_interconnected_minigrid" boolean,
	"cond_f_distribution" boolean,
	"cond_f_trading" boolean,
	"cond_disco_bulk_supply" boolean,
	"cond_sub_franchise" boolean,
	"form_sections_not_complete" text,
	"capacity_in_sections_mw" double precision,
	"confirmed_category" text,
	"category_confirmed_reason" text,
	"released_on" date,
	"date_submission_complete" date,
	"deficiency_notice_date" date,
	"show_cause_date" date,
	"certificate_issue_date" date,
	"registration_no" text,
	"certificate_needs_reissue" boolean DEFAULT false NOT NULL,
	"remarks" text,
	"priced_category" text,
	"priced_fee" bigint,
	"priced_late_initial" bigint,
	"priced_late_daily" bigint,
	"priced_late_cap" bigint,
	"priced_deadline" date,
	"priced_effective_date" date,
	"front_desk_item_id" uuid,
	"created_by" uuid,
	"created_by_name" text,
	"saved_at" timestamp with time zone,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_inward_item_id_unique" UNIQUE("inward_item_id"),
	CONSTRAINT "submissions_ack_no_unique" UNIQUE("ack_no"),
	CONSTRAINT "submissions_registration_no_unique" UNIQUE("registration_no"),
	CONSTRAINT "submissions_waiver_check" CHECK ("submissions"."approved_waiver" >= 0)
);
--> statement-breakpoint
ALTER TABLE "correspondence_types" ADD CONSTRAINT "correspondence_types_default_unit_id_units_id_fk" FOREIGN KEY ("default_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_correspondence_type_id_correspondence_types_id_fk" FOREIGN KEY ("correspondence_type_id") REFERENCES "public"."correspondence_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_unit_override_id_units_id_fk" FOREIGN KEY ("unit_override_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_routed_by_user_id_users_id_fk" FOREIGN KEY ("routed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deficiency_notices" ADD CONSTRAINT "deficiency_notices_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deficiency_notices" ADD CONSTRAINT "deficiency_notices_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_checklist" ADD CONSTRAINT "document_checklist_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_answers" ADD CONSTRAINT "evaluation_answers_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_answers" ADD CONSTRAINT "evaluation_answers_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluating_officer_id_users_id_fk" FOREIGN KEY ("evaluating_officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_reviewing_supervisor_id_users_id_fk" FOREIGN KEY ("reviewing_supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_approving_officer_id_users_id_fk" FOREIGN KEY ("approving_officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_use_notifications" ADD CONSTRAINT "own_use_notifications_inward_item_id_inward_items_id_fk" FOREIGN KEY ("inward_item_id") REFERENCES "public"."inward_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_use_notifications" ADD CONSTRAINT "own_use_notifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_use_notifications" ADD CONSTRAINT "own_use_notifications_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_use_units" ADD CONSTRAINT "own_use_units_notification_id_own_use_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."own_use_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_licences" ADD CONSTRAINT "submission_licences_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_other_activities" ADD CONSTRAINT "submission_other_activities_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_inward_item_id_inward_items_id_fk" FOREIGN KEY ("inward_item_id") REFERENCES "public"."inward_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inward_items_deemed_idx" ON "inward_items" USING btree ("deemed_receipt_date");--> statement-breakpoint
CREATE INDEX "inward_items_type_idx" ON "inward_items" USING btree ("correspondence_type_id");--> statement-breakpoint
CREATE INDEX "own_use_cac_idx" ON "own_use_notifications" USING btree (lower(trim("cac_no")));--> statement-breakpoint
CREATE INDEX "payments_owner_idx" ON "payments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "payments_rrr_idx" ON "payments" USING btree (lower(trim("rrr")));--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submissions_cac_idx" ON "submissions" USING btree (lower(trim("cac_no")));--> statement-breakpoint
CREATE INDEX "submissions_linked_idx" ON "submissions" USING btree ("linked_submission_id");