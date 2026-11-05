-- Database-level guards (docs/PLAN.md §3, §5).

-- 1. The audit log is append-only: no UPDATE, DELETE or TRUNCATE, whoever asks.
CREATE OR REPLACE FUNCTION audit_log_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_change();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_change();
--> statement-breakpoint

-- 2. The single head row of the audit hash chain. The genesis hash is 64 zeros.
INSERT INTO audit_chain_head (id, seq, hash)
VALUES (1, 0, repeat('0', 64))
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- 3. Roles are one of the fixed set (src/domain/roles.ts).
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check CHECK (
  role IN ('front_desk', 'registry', 'router', 'unit_officer', 'evaluator',
           'supervisor', 'approver', 'finance', 'admin', 'viewer')
);
--> statement-breakpoint

-- 4. A counter never goes backwards ([G12]: numbers are never reused).
CREATE OR REPLACE FUNCTION counters_no_decrease() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.last_value < OLD.last_value THEN
    RAISE EXCEPTION 'counter %/%/% cannot go backwards (% -> %)',
      OLD.series, OLD.year, OLD.scope, OLD.last_value, NEW.last_value
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER counters_no_decrease
  BEFORE UPDATE ON counters
  FOR EACH ROW EXECUTE FUNCTION counters_no_decrease();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION counters_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'counters cannot be deleted' USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER counters_no_delete
  BEFORE DELETE ON counters
  FOR EACH ROW EXECUTE FUNCTION counters_no_delete();
