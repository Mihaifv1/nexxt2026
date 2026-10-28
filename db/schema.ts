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
