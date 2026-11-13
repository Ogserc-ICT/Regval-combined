ALTER TABLE "deficiency_notices" ADD COLUMN "contents" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "certificate_serial" integer;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_certificate_serial_unique" UNIQUE("certificate_serial");--> statement-breakpoint
-- CERT-01 serial numbers (Q28d): one series that never resets, kept in counters as year 0.
-- Certificates already issued get serials in the order they were issued.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY certificate_issue_date, registration_no) AS n
  FROM submissions
  WHERE registration_no IS NOT NULL AND filing_type = 'NEW' AND certificate_serial IS NULL
)
UPDATE submissions s SET certificate_serial = o.n FROM ordered o WHERE s.id = o.id;--> statement-breakpoint
INSERT INTO counters (series, year, scope, last_value)
SELECT 'CERT', 0, '', count(*) FROM submissions WHERE certificate_serial IS NOT NULL
HAVING count(*) > 0
ON CONFLICT (series, year, scope) DO NOTHING;--> statement-breakpoint
DROP TRIGGER IF EXISTS "submissions_numbers_locked" ON "submissions";--> statement-breakpoint
CREATE TRIGGER "submissions_numbers_locked" BEFORE UPDATE ON "submissions"
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('ack_no', 'registration_no', 'deemed_receipt_date', 'certificate_serial');--> statement-breakpoint
DROP TRIGGER IF EXISTS "deficiency_notices_locked" ON "deficiency_notices";--> statement-breakpoint
CREATE TRIGGER "deficiency_notices_locked" BEFORE UPDATE ON "deficiency_notices"
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('def_no', 'issued_on', 'submission_id', 'sent_on', 'response_due', 'response_received_on', 'contents');
