-- Admin data tools (Admin › Data management): an admin may clear registers or delete an entry.
-- The no-delete guards stay in force for everything else. They stand aside only inside a
-- transaction that has set `ogserc.allow_delete` to 'on' (set_config(..., true) lasts for that
-- transaction only), which only the admin data service does, after checking the admin's role
-- and password, and which writes its own audit entry. The audit log's guards are not changed:
-- it is never cleared.

CREATE OR REPLACE FUNCTION reject_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('ogserc.allow_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint

-- A cleared register restarts its number series at 1: its counter row may then be deleted.
CREATE OR REPLACE FUNCTION counters_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('ogserc.allow_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'counters cannot be deleted' USING ERRCODE = 'insufficient_privilege';
END;
$$;
