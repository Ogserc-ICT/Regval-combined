CREATE TABLE "file_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"out_at" timestamp with time zone NOT NULL,
	"volume" integer,
	"released_by_user_id" uuid,
	"released_by_name" text,
	"issued_to" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"purpose" text,
	"return_by_override" date,
	"returned_at" timestamp with time zone,
	"received_back_by_user_id" uuid,
	"received_back_by_name" text,
	"remarks" text,
	"is_example" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_ref" text NOT NULL,
	"title" text NOT NULL,
	"file_class" text NOT NULL,
	"owning_unit_id" uuid,
	"opened_on" date NOT NULL,
	"current_volume" integer DEFAULT 1 NOT NULL,
	"security" text DEFAULT 'Open' NOT NULL,
	"status" text DEFAULT 'Open' NOT NULL,
	"closed_on" date,
	"remarks" text,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_file_ref_unique" UNIQUE("file_ref")
);
--> statement-breakpoint
CREATE TABLE "front_desk_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fd_no" text NOT NULL,
	"fd_year" integer NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"sender" text NOT NULL,
	"subject" text NOT NULL,
	"correspondence_type_id" uuid,
	"mode" text NOT NULL,
	"delivered_by" text,
	"phone" text,
	"volumes" integer,
	"received_by_user_id" uuid,
	"received_by_name" text,
	"remarks" text,
	"inward_item_id" uuid,
	"registered_at" timestamp with time zone,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "front_desk_items_fd_no_unique" UNIQUE("fd_no"),
	CONSTRAINT "front_desk_items_inward_item_id_unique" UNIQUE("inward_item_id")
);
--> statement-breakpoint
CREATE TABLE "outward_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"out_no" text NOT NULL,
	"out_year" integer NOT NULL,
	"document_date" date NOT NULL,
	"document_type" text NOT NULL,
	"subject" text NOT NULL,
	"addressee" text NOT NULL,
	"recipient_category" text NOT NULL,
	"recipient_contact" text,
	"in_reply_to_inward_id" uuid,
	"related_ogserc_no" text,
	"file_id" uuid,
	"originating_unit_id" uuid NOT NULL,
	"prepared_by" text,
	"signatory_id" uuid,
	"signatory_name" text NOT NULL,
	"signatory_designation" text,
	"dispatch_mode" text NOT NULL,
	"dispatched_on" date,
	"dispatched_by_user_id" uuid,
	"tracking_ref" text,
	"delivery_confirmed" boolean DEFAULT false NOT NULL,
	"delivered_on" date,
	"received_by_recipient" text,
	"response_expected" boolean,
	"response_due_override" date,
	"remarks" text,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outward_items_out_no_unique" UNIQUE("out_no")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "inward_items" ADD COLUMN "unit_received_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "file_movements" ADD CONSTRAINT "file_movements_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_movements" ADD CONSTRAINT "file_movements_released_by_user_id_users_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_movements" ADD CONSTRAINT "file_movements_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_movements" ADD CONSTRAINT "file_movements_received_back_by_user_id_users_id_fk" FOREIGN KEY ("received_back_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owning_unit_id_units_id_fk" FOREIGN KEY ("owning_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "front_desk_items" ADD CONSTRAINT "front_desk_items_correspondence_type_id_correspondence_types_id_fk" FOREIGN KEY ("correspondence_type_id") REFERENCES "public"."correspondence_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "front_desk_items" ADD CONSTRAINT "front_desk_items_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "front_desk_items" ADD CONSTRAINT "front_desk_items_inward_item_id_inward_items_id_fk" FOREIGN KEY ("inward_item_id") REFERENCES "public"."inward_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outward_items" ADD CONSTRAINT "outward_items_in_reply_to_inward_id_inward_items_id_fk" FOREIGN KEY ("in_reply_to_inward_id") REFERENCES "public"."inward_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outward_items" ADD CONSTRAINT "outward_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outward_items" ADD CONSTRAINT "outward_items_originating_unit_id_units_id_fk" FOREIGN KEY ("originating_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outward_items" ADD CONSTRAINT "outward_items_signatory_id_signatories_id_fk" FOREIGN KEY ("signatory_id") REFERENCES "public"."signatories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outward_items" ADD CONSTRAINT "outward_items_dispatched_by_user_id_users_id_fk" FOREIGN KEY ("dispatched_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outward_items" ADD CONSTRAINT "outward_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_movements_file_idx" ON "file_movements" USING btree ("file_id","out_at");--> statement-breakpoint
CREATE INDEX "outward_items_reply_idx" ON "outward_items" USING btree ("in_reply_to_inward_id");--> statement-breakpoint
CREATE INDEX "outward_items_file_idx" ON "outward_items" USING btree ("file_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_in_response_to_outward_id_outward_items_id_fk" FOREIGN KEY ("in_response_to_outward_id") REFERENCES "public"."outward_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_unit_received_by_user_id_users_id_fk" FOREIGN KEY ("unit_received_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_front_desk_item_id_front_desk_items_id_fk" FOREIGN KEY ("front_desk_item_id") REFERENCES "public"."front_desk_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inward_items_outward_idx" ON "inward_items" USING btree ("in_response_to_outward_id");--> statement-breakpoint
CREATE INDEX "inward_items_file_idx" ON "inward_items" USING btree ("file_id");--> statement-breakpoint
ALTER TABLE "inward_items" ADD CONSTRAINT "inward_items_front_desk_item_id_unique" UNIQUE("front_desk_item_id");