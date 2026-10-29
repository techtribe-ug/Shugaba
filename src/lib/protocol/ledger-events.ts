import { z } from "zod";
import { Cents, PositiveCents } from "./money";
import { ProtectionTier } from "./enums";

const id = z.string().min(1);

/** Every state change writes one of these first (spec 6.3). Payloads hold ids and amounts, never emails or PayPal ids. */
export const LedgerEventPayload = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CIRCLE_CREATED"), name: z.string(), rulesHash: z.string(), createdBy: id }),
  z.object({ type: z.literal("RULES_SIGNED"), membershipId: id, rulesHash: z.string() }),
  z.object({ type: z.literal("MEMBER_JOINED"), membershipId: id, position: z.number().int().nullable() }),
  z.object({ type: z.literal("ORDER_SET"), order: z.array(id), seed: z.string().optional(), mode: z.enum(["SMART", "MANUAL"]) }),
  z.object({ type: z.literal("ROUND_OPENED"), roundId: id, seq: z.number().int(), recipientMembershipId: id }),
  z.object({ type: z.literal("CONTRIBUTION_PAID"), contributionId: id, membershipId: id, roundSeq: z.number().int(), amount: PositiveCents, fee: Cents, late: z.boolean() }),
  z.object({ type: z.literal("CONTRIBUTION_FAILED"), contributionId: id, membershipId: id, roundSeq: z.number().int(), reason: z.string() }),
  z.object({ type: z.literal("GRACE_STARTED"), roundId: id, seq: z.number().int(), graceEndsAt: z.string(), unpaid: z.array(id) }),
  z.object({ type: z.literal("POOL_FEE_IN"), contributionId: id, toPool: Cents, toReserve: Cents }),
  z.object({ type: z.literal("POOL_COVER"), roundId: id, membershipId: id, amount: PositiveCents }),
  z.object({ type: z.literal("RESERVE_COVER"), roundId: id, membershipId: id, amount: PositiveCents }),
  z.object({ type: z.literal("PAYOUT_SENT"), payoutId: id, roundId: id, recipientMembershipId: id, amount: PositiveCents, fromPool: Cents }),
  z.object({ type: z.literal("PAYOUT_CONFIRMED"), payoutId: id, roundId: id }),
  z.object({ type: z.literal("RECOVERY_OPENED"), recoveryId: id, membershipId: id, roundId: id, amountDue: PositiveCents }),
  z.object({ type: z.literal("RECOVERY_PAYMENT"), recoveryId: id, amount: PositiveCents, toReserve: Cents, toPool: Cents }),
  z.object({ type: z.literal("TRADE_CONFIRMED"), tradeId: id, fromMembershipId: id, toMembershipId: id, fromSeq: z.number().int(), toSeq: z.number().int(), bonus: Cents }),
  z.object({ type: z.literal("BONUS_HELD"), tradeId: id, amount: PositiveCents, forMembershipId: id }),
  z.object({ type: z.literal("BONUS_RELEASED"), tradeId: id, amount: PositiveCents, toMembershipId: id }),
  z.object({ type: z.literal("BONUS_RETURNED"), tradeId: id, amount: PositiveCents, toMembershipId: id }),
  z.object({ type: z.literal("SCORE_CHANGED"), memberId: id, delta: z.number().int(), score: z.number().int(), reason: z.string() }),
  z.object({ type: z.literal("TIER_RAISED"), from: ProtectionTier, to: ProtectionTier, reason: z.string() }),
  z.object({ type: z.literal("CIRCLE_PAUSED"), reason: z.string() }),
  z.object({ type: z.literal("CIRCLE_COMPLETED") }),
  z.object({ type: z.literal("CLOCK_ADVANCED"), byMs: z.number().int(), nowIso: z.string() }),
  z.object({ type: z.literal("MEMBER_LEFT"), membershipId: id }),
  z.object({ type: z.literal("SEAT_OPENED"), seq: z.number().int() }),
  z.object({ type: z.literal("LEAVER_REFUND_SCHEDULED"), membershipId: id, amount: Cents, onRoundSeq: z.number().int() }),
  z.object({ type: z.literal("LEAVER_REFUND_PAID"), membershipId: id, amount: PositiveCents }),
  z.object({ type: z.literal("SEAT_FILLED"), membershipId: id, seq: z.number().int(), missedRounds: z.number().int() }),
  z.object({ type: z.literal("JOINER_HOLDBACK"), membershipId: id, amount: PositiveCents, toPool: Cents, toLeaverRefund: Cents }),
  z.object({ type: z.literal("OPERATOR_ACTION"), operatorId: id, action: z.string(), reason: z.string().min(3) }),
]);
export type LedgerEventPayload = z.infer<typeof LedgerEventPayload>;
export type LedgerEventType = LedgerEventPayload["type"];

export const Actor = z.string().regex(/^(member:.+|worker|agent:.+|judge|operator:.+|system)$/);
export type Actor = z.infer<typeof Actor>;

/** A ledger row as stored and as hashed. `createdAt` is an ISO string so hashing is stable everywhere. */
export const LedgerEvent = z.object({
  seq: z.number().int().nonnegative(),
  circleId: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  actor: Actor,
  createdAt: z.string(),
  prevHash: z.string().length(64),
  hash: z.string().length(64),
});
export type LedgerEvent = z.infer<typeof LedgerEvent>;
