CREATE TRIGGER b2c_audit_no_update BEFORE UPDATE ON b2c_audit_events
BEGIN SELECT RAISE(ABORT, 'b2c_audit_events is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER b2c_audit_no_delete BEFORE DELETE ON b2c_audit_events
BEGIN SELECT RAISE(ABORT, 'b2c_audit_events is append-only'); END;
--> statement-breakpoint
CREATE INDEX b2c_cases_owner_idx ON b2c_dispute_cases(owner_id);
--> statement-breakpoint
CREATE INDEX b2c_audit_case_idx ON b2c_audit_events(owner_id, case_id, timestamp);
