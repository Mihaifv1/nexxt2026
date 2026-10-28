CREATE TABLE `b2c_branch_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`slot_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `b2c_customer_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`last_mutation` text NOT NULL
);
