import { z } from "zod";

export const Language = z.enum(["en", "ha", "pcm"]);
export type Language = z.infer<typeof Language>;

export const Currency = z.enum(["USD"]);
export type Currency = z.infer<typeof Currency>;

export const Frequency = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
export type Frequency = z.infer<typeof Frequency>;

export const OrderMode = z.enum(["SMART", "MANUAL"]);
export type OrderMode = z.infer<typeof OrderMode>;

export const ProtectionTier = z.enum(["BASIC", "STANDARD", "PLUS"]);
export type ProtectionTier = z.infer<typeof ProtectionTier>;

export const CircleStatus = z.enum(["DRAFT", "FORMING", "ACTIVE", "PAUSED", "COMPLETED", "DISSOLVED"]);
export type CircleStatus = z.infer<typeof CircleStatus>;

// HELD is a side state: settlement found the cover limit breached, so the payout waits for an operator.
export const RoundStatus = z.enum(["SCHEDULED", "COLLECTING", "GRACE", "SETTLING", "HELD", "PAID_OUT"]);
export type RoundStatus = z.infer<typeof RoundStatus>;

export const MembershipStatus = z.enum(["INVITED", "SIGNED", "ACTIVE", "PAUSED", "REMOVED", "LEFT"]);
export type MembershipStatus = z.infer<typeof MembershipStatus>;

export const SeatState = z.enum(["FILLED", "OPEN"]);
export type SeatState = z.infer<typeof SeatState>;

export const ContributionStatus = z.enum(["SCHEDULED", "PAID", "LATE", "FAILED", "COVERED", "RECOVERED"]);
export type ContributionStatus = z.infer<typeof ContributionStatus>;

export const CollectionMode = z.enum(["VAULT", "SUBSCRIPTION", "MOCK"]);
export type CollectionMode = z.infer<typeof CollectionMode>;

export const MandateStatus = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"]);
export type MandateStatus = z.infer<typeof MandateStatus>;

export const PayoutStatus = z.enum(["PENDING", "SENT", "SUCCEEDED", "FAILED"]);
export type PayoutStatus = z.infer<typeof PayoutStatus>;

export const PoolEntryType = z.enum([
  "FEE_IN",
  "RESERVE_IN",
  "COVER_OUT",
  "RESERVE_COVER_OUT",
  "RECOVERY_IN",
  "RESERVE_REPAY",
  "ROUNDING_IN",
  "BONUS_HOLD",
  "BONUS_RELEASE",
  "BONUS_RETURN",
  "HOLDBACK_IN",
  "LEAVER_REFUND_OUT",
]);
export type PoolEntryType = z.infer<typeof PoolEntryType>;

export const RecoveryStatus = z.enum(["OPEN", "PARTIAL", "PAID", "WRITTEN_OFF"]);
export type RecoveryStatus = z.infer<typeof RecoveryStatus>;

export const TradeStatus = z.enum(["NEGOTIATING", "AGREED", "CONFIRMED", "SETTLED", "REJECTED", "EXPIRED"]);
export type TradeStatus = z.infer<typeof TradeStatus>;

export const AgentName = z.enum(["shugaba", "member", "recovery", "analyst"]);
export type AgentName = z.infer<typeof AgentName>;

export const NotificationChannel = z.enum(["push", "whatsapp"]);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

export const OutboundStatus = z.enum(["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"]);
export type OutboundStatus = z.infer<typeof OutboundStatus>;

export const FraudRule = z.enum(["SHARED_PAYMENT_ACCOUNT", "METHOD_CHANGED_BEFORE_PAYOUT", "JOINED_TOGETHER_DEFAULTED_TOGETHER"]);
export type FraudRule = z.infer<typeof FraudRule>;

/** Internal score tier enum. The UI shows level titles instead (see levels.ts). */
export const ScoreTier = z.enum(["BRONZE", "SILVER", "GOLD", "DIAMOND"]);
export type ScoreTier = z.infer<typeof ScoreTier>;
