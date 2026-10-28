CREATE TABLE `b2c_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_incident_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_investigation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`lock_token` text NOT NULL,
	`lease_until` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`error` text,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_action_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_customer_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_customer_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_rulebook_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_rule_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_investigation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_incident_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`run_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`last_mutation` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_synthetic_payment_records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`data` text NOT NULL
);
