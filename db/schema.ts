import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const cases = sqliteTable("b2c_dispute_cases", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  version: integer("version").notNull(),
  data: text("data").notNull(),
  last_mutation: text("last_mutation").notNull(),
});
export const events = sqliteTable("b2c_audit_events", {
  event_id: text("event_id").primaryKey(),
  case_id: text("case_id").notNull(),
  owner_id: text("owner_id").notNull(),
  timestamp: text("timestamp").notNull(),
  data: text("data").notNull(),
});
export const sessions = sqliteTable("b2c_demo_sessions", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  role: text("role").notNull(),
  customer_id: text("customer_id"),
  expires_at: text("expires_at").notNull(),
});
export const profiles = sqliteTable("b2c_customer_profiles", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  version: integer("version").notNull(),
  data: text("data").notNull(),
  last_mutation: text("last_mutation").notNull(),
});
export const bookings = sqliteTable("b2c_branch_bookings", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  customer_id: text("customer_id").notNull(),
  slot_id: text("slot_id").notNull(),
});
export const incidents = sqliteTable("b2c_incidents", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  version: integer("version").notNull(),
  data: text("data").notNull(),
  last_mutation: text("last_mutation").notNull(),
});
export const paymentRecords = sqliteTable("b2c_synthetic_payment_records", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  customer_id: text("customer_id").notNull(),
  data: text("data").notNull(),
});
export const incidentJobs = sqliteTable("b2c_investigation_jobs", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  incident_id: text("incident_id").notNull(),
  run_id: text("run_id").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull(),
  lock_token: text("lock_token").notNull(),
  lease_until: text("lease_until").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  error: text("error"),
  actor_id: text("actor_id").notNull(),
  actor_role: text("actor_role").notNull(),
});
const projection = (name: string) =>
  sqliteTable(name, {
    id: text("id").primaryKey(),
    owner_id: text("owner_id").notNull(),
    incident_id: text("incident_id").notNull(),
    run_id: text("run_id"),
    data: text("data").notNull(),
  });
export const incidentTransactions = projection("b2c_incident_transactions");
export const incidentEvidence = projection("b2c_evidence");
export const incidentRuns = projection("b2c_investigation_runs");
export const incidentCalls = projection("b2c_tool_calls");
export const incidentRules = projection("b2c_rule_evaluations");
export const incidentProposals = projection("b2c_action_proposals");
export const incidentApprovals = projection("b2c_approvals");
export const incidentRequests = projection("b2c_customer_requests");
export const incidentResponses = projection("b2c_customer_responses");
export const incidentEvents = projection("b2c_case_events");
export const incidentArtifacts = projection("b2c_incident_artifacts");
export const incidentRulebooks = sqliteTable("b2c_rulebook_versions", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
});
export const workflowCases = sqliteTable("b2c_workflow_cases", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  version: integer("version").notNull(),
  data: text("data").notNull(),
  last_mutation: text("last_mutation").notNull(),
});
export const operationRecords = sqliteTable("b2c_operation_records", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull(),
  customer_id: text("customer_id").notNull(),
  data: text("data").notNull(),
});
