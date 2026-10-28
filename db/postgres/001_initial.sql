CREATE TABLE IF NOT EXISTS b2c_dispute_cases (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL,
 data TEXT NOT NULL, last_mutation TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS b2c_cases_owner_idx ON b2c_dispute_cases(owner_id);
CREATE TABLE IF NOT EXISTS b2c_audit_events (
 event_id TEXT PRIMARY KEY, case_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 timestamp TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS b2c_audit_case_idx ON b2c_audit_events(owner_id,case_id,timestamp);
CREATE TABLE IF NOT EXISTS b2c_demo_sessions (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, role TEXT NOT NULL,
 customer_id TEXT, expires_at TEXT NOT NULL
);
CREATE OR REPLACE FUNCTION b2c_block_audit_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'b2c_audit_events is append-only'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS b2c_audit_immutable ON b2c_audit_events;
CREATE TRIGGER b2c_audit_immutable BEFORE UPDATE OR DELETE ON b2c_audit_events
FOR EACH ROW EXECUTE FUNCTION b2c_block_audit_mutation();
