-- Register records are never deleted, numbers never change once issued, and a
-- payment's facts never change after it is recorded ([G12]; SPEC §3, §11).

CREATE OR REPLACE FUNCTION reject_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inward_items_no_delete BEFORE DELETE ON inward_items FOR EACH ROW EXECUTE FUNCTION reject_delete();
--> statement-breakpoint
CREATE TRIGGER submissions_no_delete BEFORE DELETE ON submissions FOR EACH ROW EXECUTE FUNCTION reject_delete();
--> statement-breakpoint
CREATE TRIGGER own_use_no_delete BEFORE DELETE ON own_use_notifications FOR EACH ROW EXECUTE FUNCTION reject_delete();
--> statement-breakpoint
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION reject_delete();
--> statement-breakpoint
CREATE TRIGGER deficiency_notices_no_delete BEFORE DELETE ON deficiency_notices FOR EACH ROW EXECUTE FUNCTION reject_delete();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION numbers_locked() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  col text;
  old_v text;
  new_v text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    EXECUTE format('select ($1).%I::text, ($2).%I::text', col, col) INTO old_v, new_v USING OLD, NEW;
    IF old_v IS NOT NULL AND new_v IS DISTINCT FROM old_v THEN
      RAISE EXCEPTION '%.% is locked once issued (% -> %)', TG_TABLE_NAME, col, old_v, coalesce(new_v, 'null')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inward_items_numbers_locked BEFORE UPDATE ON inward_items
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('ack_no', 'ack_year', 'deemed_receipt_date');
--> statement-breakpoint
CREATE TRIGGER submissions_numbers_locked BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('ack_no', 'inward_item_id', 'registration_no');
--> statement-breakpoint
CREATE TRIGGER own_use_numbers_locked BEFORE UPDATE ON own_use_notifications
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('ack_no', 'inward_item_id', 'oun_no', 'registration_no');
--> statement-breakpoint
CREATE TRIGGER deficiency_notices_locked BEFORE UPDATE ON deficiency_notices
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('def_no', 'issued_on', 'response_due', 'submission_id');
--> statement-breakpoint
CREATE TRIGGER payments_facts_locked BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('pay_no', 'date_received', 'owner_type', 'owner_id', 'reference', 'amount', 'recorded_by', 'recorded_at');
--> statement-breakpoint

-- Finance decisions are final, and a reversal is final (modPayments).
CREATE OR REPLACE FUNCTION payments_decisions_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.finance_status <> 'Pending' AND NEW.finance_status IS DISTINCT FROM OLD.finance_status THEN
    RAISE EXCEPTION 'payment %: Finance decisions are final', OLD.pay_no USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.reversed AND NOT NEW.reversed THEN
    RAISE EXCEPTION 'payment %: a reversal is final', OLD.pay_no USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER payments_decisions_final BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_decisions_final();
