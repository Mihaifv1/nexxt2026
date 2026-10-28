CREATE TABLE `b2c_dispute_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`last_mutation` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_audit_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_demo_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`role` text NOT NULL,
	`customer_id` text,
	`expires_at` text NOT NULL
);
