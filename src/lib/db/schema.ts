import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Money columns are bigint minor units, read as JS numbers (safe below 2^53 cents). */
const money = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const timestamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
};
const currency = () => text("currency").notNull().default("USD");

export const members = pgTable("members", {
  // Equals auth.users.id on Supabase.
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  country: text("country").notNull(),
  language: text("language", { enum: ["en", "ha", "pcm"] }).notNull().default("en"),
  paypalEmail: text("paypal_email"),
  paypalVaultId: text("paypal_vault_id"),
  paymentMethodChangedAt: ts("payment_method_changed_at"),
  publicKey: text("public_key").notNull(),
  // Demo only: AES-256-GCM with KEY_ENC_SECRET. Never selected into a client payload.
  privateKeyEnc: text("private_key_enc"),
  circleScore: integer("circle_score").notNull().default(550),
  isOperator: boolean("is_operator").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
});

export const circles = pgTable("circles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  contributionAmount: money("contribution_amount").notNull(),
  size: integer("size").notNull(),
  frequency: text("frequency", { enum: ["DAILY", "WEEKLY", "MONTHLY"] }).notNull(),
  orderMode: text("order_mode", { enum: ["SMART", "MANUAL"] }).notNull().default("SMART"),
  protectionTier: text("protection_tier", { enum: ["BASIC", "STANDARD", "PLUS"] }).notNull(),
  graceHours: integer("grace_hours").notNull().default(48),
  status: text("status", { enum: ["DRAFT", "FORMING", "ACTIVE", "PAUSED", "COMPLETED", "DISSOLVED"] }).notNull().default("DRAFT"),
  // Free pool (excludes bonuses held), bonuses held, and what this circle owes the global reserve.
  poolBalance: money("pool_balance").notNull().default(0),
  bonusHeldBalance: money("bonus_held_balance").notNull().default(0),
  reserveOwed: money("reserve_owed").notNull().default(0),
  orderSeed: text("order_seed"),
  createdBy: text("created_by").notNull().references(() => members.id),
  inviteCode: text("invite_code").notNull().unique(),
  startsAt: ts("starts_at"),
  ...timestamps,
});

export const circleRules = pgTable(
  "circle_rules",
  {
    circleId: text("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    rulesJson: jsonb("rules_json").notNull(),
    hash: text("hash").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("circle_rules_pk").on(t.circleId, t.version)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    circleId: text("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id),
    position: integer("position"),
    signature: text("signature"),
    rulesHash: text("rules_hash"),
    status: text("status", { enum: ["INVITED", "SIGNED", "ACTIVE", "PAUSED", "REMOVED", "LEFT"] }).notNull().default("INVITED"),
    agentPrefsJson: jsonb("agent_prefs_json").notNull().default(sql`'{}'::jsonb`),
    joinedRoundSeq: integer("joined_round_seq"),
    ...timestamps,
  },
  (t) => [uniqueIndex("memberships_circle_member").on(t.circleId, t.memberId), index("memberships_member").on(t.memberId)],
);

export const rounds = pgTable(
  "rounds",
  {
    id: text("id").primaryKey(),
    circleId: text("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    collectionDueAt: ts("collection_due_at").notNull(),
    graceEndsAt: ts("grace_ends_at").notNull(),
    payoutDueAt: ts("payout_due_at").notNull(),
    recipientMembershipId: text("recipient_membership_id").references(() => memberships.id),
    status: text("status", { enum: ["SCHEDULED", "COLLECTING", "GRACE", "SETTLING", "HELD", "PAID_OUT"] }).notNull().default("SCHEDULED"),
    ...timestamps,
  },
  (t) => [uniqueIndex("rounds_circle_seq").on(t.circleId, t.seq)],
);

export const contributions = pgTable(
  "contributions",
  {
    id: text("id").primaryKey(),
    roundId: text("round_id").notNull().references(() => rounds.id, { onDelete: "cascade" }),
    membershipId: text("membership_id").notNull().references(() => memberships.id),
    amount: money("amount").notNull(),
    feeAmount: money("fee_amount").notNull(),
    currency: currency(),
    providerRef: text("provider_ref"),
    status: text("status", { enum: ["SCHEDULED", "PAID", "LATE", "FAILED", "COVERED", "RECOVERED"] }).notNull().default("SCHEDULED"),
    failureReason: text("failure_reason"),
    ...timestamps,
  },
  (t) => [uniqueIndex("contributions_round_membership").on(t.roundId, t.membershipId)],
);

export const collectionMandates = pgTable("collection_mandates", {
  membershipId: text("membership_id").primaryKey().references(() => memberships.id, { onDelete: "cascade" }),
  mode: text("mode", { enum: ["VAULT", "SUBSCRIPTION", "MOCK"] }).notNull(),
  providerPlanId: text("provider_plan_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  providerVaultId: text("provider_vault_id"),
  status: text("status", { enum: ["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"] }).notNull().default("PENDING"),
  ...timestamps,
});

export const payouts = pgTable("payouts", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().unique().references(() => rounds.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  fromPoolAmount: money("from_pool_amount").notNull().default(0),
  currency: currency(),
  providerBatchId: text("provider_batch_id"),
  providerItemId: text("provider_item_id"),
  status: text("status", { enum: ["PENDING", "SENT", "SUCCEEDED", "FAILED"] }).notNull().default("PENDING"),
  ...timestamps,
});

export const poolLedger = pgTable(
  "pool_ledger",
  {
    id: text("id").primaryKey(),
    // null = global reserve
    circleId: text("circle_id").references(() => circles.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["FEE_IN", "RESERVE_IN", "COVER_OUT", "RESERVE_COVER_OUT", "RECOVERY_IN", "RESERVE_REPAY", "ROUNDING_IN", "BONUS_HOLD", "BONUS_RELEASE", "BONUS_RETURN", "HOLDBACK_IN", "LEAVER_REFUND_OUT"],
    }).notNull(),
    amount: money("amount").notNull(),
    balanceAfter: money("balance_after").notNull(),
    ref: text("ref"),
    currency: currency(),
    ...timestamps,
  },
  (t) => [index("pool_ledger_circle").on(t.circleId)],
);

/** Single row for the global reserve balance (pool_ledger rows with circle_id null explain it). */
export const globalReserve = pgTable("global_reserve", {
  id: integer("id").primaryKey().default(1),
  balance: money("balance").notNull().default(0),
  ...timestamps,
});

export const recoveries = pgTable("recoveries", {
  id: text("id").primaryKey(),
  membershipId: text("membership_id").notNull().references(() => memberships.id),
  roundId: text("round_id").notNull().references(() => rounds.id),
  amountDue: money("amount_due").notNull(),
  amountPaid: money("amount_paid").notNull().default(0),
  currency: currency(),
  providerInvoiceId: text("provider_invoice_id"),
  planJson: jsonb("plan_json"),
  status: text("status", { enum: ["OPEN", "PARTIAL", "PAID", "WRITTEN_OFF"] }).notNull().default("OPEN"),
  ...timestamps,
});

export const turnTrades = pgTable("turn_trades", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  fromMembership: text("from_membership").notNull().references(() => memberships.id),
  toMembership: text("to_membership").references(() => memberships.id),
  fromRoundSeq: integer("from_round_seq").notNull(),
  toRoundSeq: integer("to_round_seq"),
  bonusAmount: money("bonus_amount").notNull().default(0),
  currency: currency(),
  transcriptJson: jsonb("transcript_json").notNull().default(sql`'[]'::jsonb`),
  signaturesJson: jsonb("signatures_json").notNull().default(sql`'{}'::jsonb`),
  status: text("status", { enum: ["NEGOTIATING", "AGREED", "CONFIRMED", "SETTLED", "REJECTED", "EXPIRED"] }).notNull().default("NEGOTIATING"),
  ...timestamps,
});

export const scoreEvents = pgTable("score_events", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  circleId: text("circle_id").references(() => circles.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  ledgerSeq: bigint("ledger_seq", { mode: "number" }),
  ...timestamps,
});

export const ledgerEvents = pgTable(
  "ledger_events",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    circleId: text("circle_id").notNull(),
    // Position in this circle's own chain (1, 2, 3...). The hash chain is per circle.
    circleSeq: integer("circle_seq").notNull(),
    type: text("type").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    actor: text("actor").notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("ledger_events_circle_seq").on(t.circleId, t.circleSeq)],
);

export const webhookEvents = pgTable("webhook_events", {
  providerEventId: text("provider_event_id").primaryKey(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  verified: boolean("verified").notNull(),
  processedAt: ts("processed_at"),
  error: text("error"),
  ...timestamps,
});

export const agentMessages = pgTable("agent_messages", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").references(() => circles.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => members.id),
  agent: text("agent", { enum: ["shugaba", "member", "recovery", "analyst"] }).notNull(),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  language: text("language"),
  toolCallsJson: jsonb("tool_calls_json"),
  ...timestamps,
});

export const memberMemories = pgTable("member_memories", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  circleId: text("circle_id").references(() => circles.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  sourceLedgerSeq: bigint("source_ledger_seq", { mode: "number" }),
  weight: integer("weight").notNull().default(1),
  lastUsedAt: ts("last_used_at"),
  ...timestamps,
});

export const notificationChannels = pgTable("notification_channels", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["push", "whatsapp"] }).notNull(),
  phoneE164: text("phone_e164"),
  optedInAt: ts("opted_in_at"),
  optInSource: text("opt_in_source"),
  optedOutAt: ts("opted_out_at"),
  lastInboundAt: ts("last_inbound_at"),
  ...timestamps,
});

export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["push", "whatsapp"] }).notNull(),
    template: text("template").notNull(),
    paramsJson: jsonb("params_json").notNull(),
    ledgerSeq: bigint("ledger_seq", { mode: "number" }),
    providerMessageId: text("provider_message_id"),
    status: text("status", { enum: ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"] }).notNull().default("QUEUED"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("outbound_dedup").on(t.memberId, t.template, t.ledgerSeq)],
);

export const agentTraces = pgTable("agent_traces", {
  id: text("id").primaryKey(),
  agent: text("agent").notNull(),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  inputJson: jsonb("input_json").notNull(),
  outputJson: jsonb("output_json"),
  latencyMs: integer("latency_ms"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  error: text("error"),
  ...timestamps,
});

export const fraudFlags = pgTable("fraud_flags", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => members.id),
  rule: text("rule", { enum: ["SHARED_PAYMENT_ACCOUNT", "METHOD_CHANGED_BEFORE_PAYOUT", "JOINED_TOGETHER_DEFAULTED_TOGETHER"] }).notNull(),
  detailJson: jsonb("detail_json").notNull(),
  status: text("status", { enum: ["OPEN", "CLEARED", "CONFIRMED"] }).notNull().default("OPEN"),
  ...timestamps,
});

export const clock = pgTable("clock", {
  id: integer("id").primaryKey().default(1),
  anchorMs: bigint("anchor_ms", { mode: "number" }).notNull().default(0),
  nowOffsetMs: bigint("now_offset_ms", { mode: "number" }).notNull().default(0),
  speed: integer("speed").notNull().default(1),
  ...timestamps,
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("rate_limits_pk").on(t.key, t.windowStart)],
);

export const proposals = pgTable("proposals", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").references(() => circles.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => members.id),
  kind: text("kind", { enum: ["PAYMENT_PLAN", "CATCH_UP_ORDER", "SWAP_REQUEST"] }).notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  status: text("status", { enum: ["PENDING", "CONFIRMED", "DECLINED", "EXPIRED"] }).notNull().default("PENDING"),
  ...timestamps,
});
