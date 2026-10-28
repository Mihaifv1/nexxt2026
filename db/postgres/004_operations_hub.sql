CREATE TABLE IF NOT EXISTS b2c_workflow_cases (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  version integer NOT NULL,
  data text NOT NULL,
  last_mutation text NOT NULL
);
CREATE TABLE IF NOT EXISTS b2c_operation_records (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  customer_id text NOT NULL,
  data text NOT NULL
);
