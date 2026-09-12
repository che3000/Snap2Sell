CREATE TABLE `agent_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_type` text NOT NULL,
	`scope` text NOT NULL,
	`scope_key` text NOT NULL,
	`event_id` text,
	`batch_id` text,
	`base_version` text,
	`proposal_data` text NOT NULL,
	`confidence` integer,
	`gate_data` text,
	`status` text NOT NULL,
	`applied_version` text,
	`created_at` integer NOT NULL,
	`evaluated_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `agent_proposals_scope_agent_time` ON `agent_proposals` (`scope_key`,`agent_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_proposals_status_time` ON `agent_proposals` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `global_policies` (
	`version` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`based_on_version` text,
	`batch_id` text,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	`rolled_back_at` integer
);
--> statement-breakpoint
CREATE TABLE `learning_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`trigger_count` integer NOT NULL,
	`queue_count` integer NOT NULL,
	`trigger_type` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`summary_data` text,
	`candidate_policy_data` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `learning_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`owner` text NOT NULL,
	`product` text NOT NULL,
	`task_type` text NOT NULL,
	`scope_key` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`batch_id` text,
	`proposal_id` text,
	`created_at` integer NOT NULL,
	`processed_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_queue_dedupe` ON `learning_queue` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `learning_queue_task_status_time` ON `learning_queue` (`task_type`,`status`,`available_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `learning_queue_scope_status_time` ON `learning_queue` (`scope_key`,`task_type`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product` text NOT NULL,
	`query` text NOT NULL,
	`source` text NOT NULL,
	`global_policy_version` text,
	`retrieval_plan` text,
	`applied_capabilities` text,
	`request_data` text NOT NULL,
	`response_data` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `market_snapshots_owner_product_time` ON `market_snapshots` (`owner`,`product`,`fetched_at`);--> statement-breakpoint
CREATE TABLE `personal_profile_versions` (
	`version` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`based_on_version` text,
	`proposal_id` text,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	`rolled_back_at` integer
);
--> statement-breakpoint
CREATE INDEX `personal_profile_versions_owner_status_time` ON `personal_profile_versions` (`owner`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `policy_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_version` text NOT NULL,
	`based_on_version` text,
	`scope` text NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`sample_count` integer NOT NULL,
	`metric_data` text NOT NULL,
	`decision` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product` text NOT NULL,
	`market_snapshot_id` text NOT NULL,
	`global_policy_version` text,
	`personal_preferences` text NOT NULL,
	`options_data` text NOT NULL,
	`default_strategy` text,
	`selected_strategy` text,
	`selected_price` integer,
	`selected_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `price_recommendations_owner_product_time` ON `price_recommendations` (`owner`,`product`,`created_at`);--> statement-breakpoint
CREATE TABLE `product_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_key` text NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`attributes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_identities_canonical_key` ON `product_identities` (`canonical_key`);--> statement-breakpoint
CREATE INDEX `product_identities_model_name` ON `product_identities` (`model`,`name`);--> statement-breakpoint
CREATE TABLE `title_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`owner` text NOT NULL,
	`product` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`was_generated` integer NOT NULL,
	`accepted` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `title_variants_identity_time` ON `title_variants` (`identity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `title_variants_owner_time` ON `title_variants` (`owner`,`created_at`);