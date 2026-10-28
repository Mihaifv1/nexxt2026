CREATE TABLE IF NOT EXISTS b2c_customer_profiles (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL,
 data TEXT NOT NULL, last_mutation TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS b2c_profiles_owner_idx ON b2c_customer_profiles(owner_id);
CREATE TABLE IF NOT EXISTS b2c_branch_bookings (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, customer_id TEXT NOT NULL, slot_id TEXT NOT NULL
);
