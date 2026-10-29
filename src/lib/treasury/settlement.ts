import type { Cents, ContributionStatus, PoolEntryType, ProtectionTier } from "@/lib/protocol";
import { DEFAULT_TREASURY_CONFIG, type TreasuryConfig } from "./config";
import { potFor } from "./fees";

/** One seat's contribution for the round being settled. */
export type SeatContribution = {
  /** null when the seat is open (a member left and nobody has joined yet). */
  membershipId: string | null;
  amount: Cents;
  status: ContributionStatus;
  /** This member already received their payout in an earlier round. */
  alreadyCollected?: boolean;
  /** Earlier misses by this member in this circle that are still not recovered. */
  openMisses?: number;
};

export type BonusRelease = { tradeId: string; amount: Cents };

/** The recipient joined late into an open seat (spec 8.7.1). */
export type LateJoinHoldback = {
  missedRounds: number;
  /** Pool covers paid for this seat while it was empty; the holdback repays these first. */
  poolRepayDue: Cents;
  leaverMembershipId: string | null;
  /** What the leaver paid in and is owed back. */
  leaverRefundDue: Cents;
};

export type SettleInput = {
  roundId: string;
  recipientMembershipId: string;
  contributionAmount: Cents;
  size: number;
  tier: ProtectionTier;
  seats: readonly SeatContribution[];
  /** Free circle pool balance (excludes bonuses held for members). */
  poolBalance: Cents;
  /** Bonuses currently held in the pool for members of this circle. */
  bonusHeldBalance: Cents;
  reserveBalance: Cents;
  /** Bonus the recipient agreed to pay for moving earlier; deducted from this payout and held. */
  bonusPaid?: { tradeId: string; amount: Cents; forMembershipId: string } | null;
  /** Bonuses held for the recipient, released into this payout. */
  bonusReleases?: readonly BonusRelease[];
  lateJoin?: LateJoinHoldback | null;
  lateFeeCents?: Cents;
  config?: TreasuryConfig;
};

export type PoolMovement = { type: PoolEntryType; amount: Cents; scope: "circle" | "reserve"; ref?: string };

export type CoverItem = { membershipId: string | null; fromPool: Cents; fromReserve: Cents };

export type NewRecovery = { membershipId: string; amountDue: Cents };

export type SettleOk = {
  pause: false;
  pot: Cents;
  payoutAmount: Cents;
  collected: Cents;
  coverFromPool: Cents;
  coverFromReserve: Cents;
  covers: CoverItem[];
  newRecoveries: NewRecovery[];
  bonusHeld: Cents;
  bonusReleased: Cents;
  holdback: { amount: Cents; toPool: Cents; toLeaverRefund: Cents };
  movements: PoolMovement[];
  poolAfter: Cents;
  bonusHeldAfter: Cents;
  reserveAfter: Cents;
  /** Added to what this circle owes the global reserve. */
  reserveOwedIncrease: Cents;
};

export type SettlePause = { pause: true; reason: string };

export type SettleResult = SettleOk | SettlePause;

const PAID_STATUSES: readonly ContributionStatus[] = ["PAID", "LATE"];

function assertCents(name: string, v: number) {
  if (!Number.isSafeInteger(v) || v < 0) throw new Error(`${name} must be non-negative integer cents, got ${v}`);
}

/**
 * Settles one round. The payout is always the full pot, adjusted only by swap bonuses and a late
 * joiner's holdback, or the round pauses. Never short-pays.
 */
export function settleRound(input: SettleInput): SettleResult {
  const config = input.config ?? DEFAULT_TREASURY_CONFIG;
  const policy = config.tiers[input.tier];
  const { contributionAmount: c, size } = input;
  assertCents("contributionAmount", c);
  assertCents("poolBalance", input.poolBalance);
  assertCents("bonusHeldBalance", input.bonusHeldBalance);
  assertCents("reserveBalance", input.reserveBalance);
  if (input.seats.length !== size) throw new Error(`expected ${size} seats, got ${input.seats.length}`);
  for (const s of input.seats) if (s.amount !== c) throw new Error("every seat contributes the circle amount");

  const pot = potFor(c, size);
  const paid = input.seats.filter((s) => PAID_STATUSES.includes(s.status));
  const unpaid = input.seats.filter((s) => !PAID_STATUSES.includes(s.status));
  const collected = paid.reduce((sum, s) => sum + s.amount, 0);

  if (unpaid.length > policy.coverLimit) {
    return { pause: true, reason: `${unpaid.length} missed payments; ${input.tier} covers ${policy.coverLimit}` };
  }
  const repeat = unpaid.find((s) => s.alreadyCollected && (s.openMisses ?? 0) + 1 > policy.coverLimit);
  if (repeat) {
    return { pause: true, reason: "a member who already collected has missed more than the cover limit" };
  }

  // Cover: circle pool first, then the global reserve when the tier has a backstop.
  let pool = input.poolBalance;
  let reserve = input.reserveBalance;
  const covers: CoverItem[] = [];
  const movements: PoolMovement[] = [];
  let coverFromPool = 0;
  let coverFromReserve = 0;
  for (const s of unpaid) {
    const fromPool = Math.min(s.amount, pool);
    const rest = s.amount - fromPool;
    if (rest > 0 && (!policy.reserveBackstop || reserve < rest)) {
      return { pause: true, reason: "pool and reserve cannot cover the missed payments" };
    }
    pool -= fromPool;
    reserve -= rest;
    coverFromPool += fromPool;
    coverFromReserve += rest;
    covers.push({ membershipId: s.membershipId, fromPool, fromReserve: rest });
    if (fromPool > 0) movements.push({ type: "COVER_OUT", amount: fromPool, scope: "circle", ref: s.membershipId ?? "open-seat" });
    if (rest > 0) movements.push({ type: "RESERVE_COVER_OUT", amount: rest, scope: "reserve", ref: s.membershipId ?? "open-seat" });
  }

  // Open seats are repaid by the late joiner's holdback, not by a recovery invoice.
  const newRecoveries: NewRecovery[] = unpaid
    .filter((s): s is SeatContribution & { membershipId: string } => s.membershipId !== null)
    .map((s) => ({ membershipId: s.membershipId, amountDue: s.amount + (input.lateFeeCents ?? 0) }));

  // Swap bonuses.
  let bonusHeld = input.bonusHeldBalance;
  const bonusPaid = input.bonusPaid?.amount ?? 0;
  assertCents("bonusPaid", bonusPaid);
  if (bonusPaid > 0) {
    bonusHeld += bonusPaid;
    movements.push({ type: "BONUS_HOLD", amount: bonusPaid, scope: "circle", ref: input.bonusPaid!.tradeId });
  }
  let bonusReleased = 0;
  for (const r of input.bonusReleases ?? []) {
    assertCents("bonusRelease", r.amount);
    if (r.amount > bonusHeld) throw new Error("cannot release more bonus than is held");
    bonusHeld -= r.amount;
    bonusReleased += r.amount;
    movements.push({ type: "BONUS_RELEASE", amount: r.amount, scope: "circle", ref: r.tradeId });
  }

  // Late joiner: missed rounds are held back; that money repays the pool first, then refunds the leaver.
  let holdbackAmount = 0;
  let holdbackToPool = 0;
  let toLeaverRefund = 0;
  if (input.lateJoin && input.lateJoin.missedRounds > 0) {
    holdbackAmount = input.lateJoin.missedRounds * c;
    holdbackToPool = Math.min(holdbackAmount, input.lateJoin.poolRepayDue);
    toLeaverRefund = Math.min(holdbackAmount - holdbackToPool, input.lateJoin.leaverRefundDue);
    // Any remainder (leaver paid less than the seat missed) stays in the pool.
    holdbackToPool = holdbackAmount - toLeaverRefund;
    pool += holdbackToPool;
    if (holdbackToPool > 0) movements.push({ type: "HOLDBACK_IN", amount: holdbackToPool, scope: "circle" });
    if (toLeaverRefund > 0) movements.push({ type: "LEAVER_REFUND_OUT", amount: toLeaverRefund, scope: "circle", ref: input.lateJoin.leaverMembershipId ?? undefined });
  }

  const payoutAmount = pot - bonusPaid + bonusReleased - holdbackAmount;
  if (payoutAmount <= 0) return { pause: true, reason: "payout would not be positive" };

  return {
    pause: false,
    pot,
    payoutAmount,
    collected,
    coverFromPool,
    coverFromReserve,
    covers,
    newRecoveries,
    bonusHeld: bonusPaid,
    bonusReleased,
    holdback: { amount: holdbackAmount, toPool: holdbackToPool, toLeaverRefund },
    movements,
    poolAfter: pool,
    bonusHeldAfter: bonusHeld,
    reserveAfter: reserve,
    reserveOwedIncrease: coverFromReserve,
  };
}

/** A recovery payment repays what the circle owes the global reserve first, then refills the circle pool. */
export function splitRecoveryPayment(amount: Cents, reserveOwed: Cents): { toReserve: Cents; toPool: Cents } {
  assertCents("amount", amount);
  assertCents("reserveOwed", reserveOwed);
  const toReserve = Math.min(amount, reserveOwed);
  return { toReserve, toPool: amount - toReserve };
}

export function recoveryStatusAfter(amountDue: Cents, amountPaid: Cents): "OPEN" | "PARTIAL" | "PAID" {
  if (amountPaid <= 0) return "OPEN";
  return amountPaid >= amountDue ? "PAID" : "PARTIAL";
}
