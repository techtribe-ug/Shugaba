CREATE TABLE "agent_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text,
	"member_id" text,
	"agent" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"language" text,
	"tool_calls_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_json" jsonb NOT NULL,
	"output_json" jsonb,
	"latency_ms" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_rules" (
	"circle_id" text NOT NULL,
	"version" integer NOT NULL,
	"rules_json" jsonb NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"contribution_amount" bigint NOT NULL,
	"size" integer NOT NULL,
	"frequency" text NOT NULL,
	"order_mode" text DEFAULT 'SMART' NOT NULL,
	"protection_tier" text NOT NULL,
	"grace_hours" integer DEFAULT 48 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"pool_balance" bigint DEFAULT 0 NOT NULL,
	"bonus_held_balance" bigint DEFAULT 0 NOT NULL,
	"reserve_owed" bigint DEFAULT 0 NOT NULL,
	"order_seed" text,
	"created_by" text NOT NULL,
	"invite_code" text NOT NULL,
	"starts_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circles_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "clock" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"anchor_ms" bigint DEFAULT 0 NOT NULL,
	"now_offset_ms" bigint DEFAULT 0 NOT NULL,
	"speed" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_mandates" (
	"membership_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"provider_plan_id" text,
	"provider_subscription_id" text,
	"provider_vault_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"fee_amount" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"member_id" text,
	"rule" text NOT NULL,
	"detail_json" jsonb NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_reserve" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"circle_seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"actor" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"circle_id" text,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"source_ledger_seq" bigint,
	"weight" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"country" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"paypal_email" text,
	"paypal_vault_id" text,
	"payment_method_changed_at" timestamp with time zone,
	"public_key" text NOT NULL,
	"private_key_enc" text,
	"circle_score" integer DEFAULT 550 NOT NULL,
	"is_operator" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"member_id" text NOT NULL,
	"position" integer,
	"signature" text,
	"rules_hash" text,
	"status" text DEFAULT 'INVITED' NOT NULL,
	"agent_prefs_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"joined_round_seq" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"channel" text NOT NULL,
	"phone_e164" text,
	"opted_in_at" timestamp with time zone,
	"opt_in_source" text,
	"opted_out_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"params_json" jsonb NOT NULL,
	"ledger_seq" bigint,
	"provider_message_id" text,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"from_pool_amount" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"provider_batch_id" text,
	"provider_item_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_round_id_unique" UNIQUE("round_id")
);
--> statement-breakpoint
CREATE TABLE "pool_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"ref" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text,
	"member_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recoveries" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_id" text NOT NULL,
	"round_id" text NOT NULL,
	"amount_due" bigint NOT NULL,
	"amount_paid" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"provider_invoice_id" text,
	"plan_json" jsonb,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"seq" integer NOT NULL,
	"collection_due_at" timestamp with time zone NOT NULL,
	"grace_ends_at" timestamp with time zone NOT NULL,
	"payout_due_at" timestamp with time zone NOT NULL,
	"recipient_membership_id" text,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_events" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"circle_id" text,
	"type" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ledger_seq" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"from_membership" text NOT NULL,
	"to_membership" text,
	"from_round_seq" integer NOT NULL,
	"to_round_seq" integer,
	"bonus_amount" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"transcript_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signatures_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'NEGOTIATING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"provider_event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"verified" boolean NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_rules" ADD CONSTRAINT "circle_rules_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_mandates" ADD CONSTRAINT "collection_mandates_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_memories" ADD CONSTRAINT "member_memories_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_memories" ADD CONSTRAINT "member_memories_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_ledger" ADD CONSTRAINT "pool_ledger_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_recipient_membership_id_memberships_id_fk" FOREIGN KEY ("recipient_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_trades" ADD CONSTRAINT "turn_trades_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_trades" ADD CONSTRAINT "turn_trades_from_membership_memberships_id_fk" FOREIGN KEY ("from_membership") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_trades" ADD CONSTRAINT "turn_trades_to_membership_memberships_id_fk" FOREIGN KEY ("to_membership") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "circle_rules_pk" ON "circle_rules" USING btree ("circle_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_round_membership" ON "contributions" USING btree ("round_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_events_circle_seq" ON "ledger_events" USING btree ("circle_id","circle_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_circle_member" ON "memberships" USING btree ("circle_id","member_id");--> statement-breakpoint
CREATE INDEX "memberships_member" ON "memberships" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_dedup" ON "outbound_messages" USING btree ("member_id","template","ledger_seq");--> statement-breakpoint
CREATE INDEX "pool_ledger_circle" ON "pool_ledger" USING btree ("circle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_pk" ON "rate_limits" USING btree ("key","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_circle_seq" ON "rounds" USING btree ("circle_id","seq");