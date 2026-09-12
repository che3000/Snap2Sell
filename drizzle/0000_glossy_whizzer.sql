CREATE TABLE `credentials` (
	`owner` text PRIMARY KEY NOT NULL,
	`cipher` text NOT NULL,
	`model` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`store` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE INDEX `drafts_owner_store` ON `drafts` (`owner`,`store`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product` text NOT NULL,
	`scope` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_owner_scope_time` ON `events` (`owner`,`scope`,`at`);--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product` text NOT NULL,
	`data` text NOT NULL,
	`at` integer NOT NULL,
	`observed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`owner` text NOT NULL,
	`scope` text NOT NULL,
	`data` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`owner`, `scope`)
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `uploads_owner` ON `uploads` (`owner`);