ALTER TABLE "signatories" DROP CONSTRAINT "signatories_role_check";--> statement-breakpoint
ALTER TABLE "signatories" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_role_check" CHECK ("signatories"."role" in ('chairman_ceo', 'commissioner', 'secretary', 'head_of_finance', 'other'));