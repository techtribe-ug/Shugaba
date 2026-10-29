import type { AgentPrefs, Cents, ProtectionTier, RoundStatus, ScoreTier, TradeTerms } from "@/lib/protocol";
import { bpsOf } from "@/lib/protocol";
import { DEFAULT_TREASURY_CONFIG, type TreasuryConfig } from "./config";
import { swapBonusCap } from "./fees";

export type TradeRound = { seq: number; status: RoundStatus; recipientMembershipId: string };

export type TradeContext = {
  pot: Cents;
  size: number;
  tier: ProtectionTier;
  rounds: readonly TradeRound[];
  /** Memberships that already received a payout. */
  collected: ReadonlySet<string>;
  prefs: Readonly<Record<string, AgentPrefs>>;
  scoreTiers: Readonly<Record<string, ScoreTier>>;
  /** Both Ed25519 signatures checked by the caller (crypto stays outside this pure module). */
  signaturesValid: boolean;
  config?: TreasuryConfig;
};

export type TradeVerdict =
  | { ok: true; raiseTierTo: ProtectionTier | null }
  | { ok: false; reasons: string[] };

/** Spec 8.4: every rule a turn swap must pass before money or order changes. */
export function validateTrade(ctx: TradeContext, t: TradeTerms): TradeVerdict {
  const reasons: string[] = [];
  const config = ctx.config ?? DEFAULT_TREASURY_CONFIG;
  const byseq = new Map(ctx.rounds.map((r) => [r.seq, r]));
  const fromRound = byseq.get(t.fromRoundSeq);
  const toRound = byseq.get(t.toRoundSeq);

  if (t.fromMembershipId === t.toMembershipId) reasons.push("cannot swap with yourself");
  if (!fromRound || !toRound) reasons.push("unknown round");
  if (fromRound && fromRound.recipientMembershipId !== t.fromMembershipId) reasons.push("requester does not hold that turn");
  if (toRound && toRound.recipientMembershipId !== t.toMembershipId) reasons.push("other member does not hold that turn");
  if (t.toRoundSeq >= t.fromRoundSeq) reasons.push("requester must move to an earlier turn");
  if (fromRound && fromRound.status !== "SCHEDULED") reasons.push(`round ${t.fromRoundSeq} is not scheduled`);
  if (toRound && toRound.status !== "SCHEDULED") reasons.push(`round ${t.toRoundSeq} is not scheduled`);
  if (ctx.collected.has(t.fromMembershipId) || ctx.collected.has(t.toMembershipId)) reasons.push("a member already collected");

  if (!Number.isSafeInteger(t.bonus) || t.bonus < 0) reasons.push("bonus must be non-negative cents");
  const cap = swapBonusCap(ctx.pot, config);
  if (t.bonus > cap) reasons.push(`bonus above the ${config.swapBonusCapBps / 100}% cap`);

  const payer = ctx.prefs[t.fromMembershipId];
  const receiver = ctx.prefs[t.toMembershipId];
  if (!receiver?.acceptSwapLater) reasons.push("other member does not accept a later turn");
  if (receiver) {
    if (t.bonus < bpsOf(ctx.pot, receiver.minBonusBps)) reasons.push("bonus below the other member's minimum");
    if (receiver.latestAcceptableRoundSeq !== undefined && t.fromRoundSeq > receiver.latestAcceptableRoundSeq) {
      reasons.push("turn is later than the other member accepts");
    }
  }
  if (!payer || t.bonus > Math.min(payer.maxBonus, cap)) reasons.push("bonus above the requester's maximum");
  if (!ctx.signaturesValid) reasons.push("signatures not valid");

  if (reasons.length) return { ok: false, reasons };

  // A Newcomer moving into the first half raises protection to PLUS for this cycle.
  const firstHalf = t.toRoundSeq <= Math.floor(ctx.size / 2);
  const raise = firstHalf && ctx.scoreTiers[t.fromMembershipId] === "BRONZE" && ctx.tier !== "PLUS";
  return { ok: true, raiseTierTo: raise ? "PLUS" : null };
}
