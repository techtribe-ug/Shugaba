import type { Cents } from "@/lib/protocol";

export type LateJoinTerms = {
  missedRounds: number;
  holdback: Cents;
  payout: Cents;
  roundsPaidBeforeCollect: number;
  /** The seat's turn comes too soon: the joiner swaps with the last turn instead. */
  swapWithLastTurn: boolean;
  turnSeq: number;
};

/**
 * Spec 8.7.1. A joiner who first pays in round `joinSeq` takes the open seat's turn `seatTurnSeq`.
 * Missed rounds are held back from their payout, which is shown before they sign.
 */
export function lateJoinTerms(input: {
  contributionAmount: Cents;
  size: number;
  joinSeq: number;
  seatTurnSeq: number;
  minRoundsPaid?: number;
}): LateJoinTerms {
  const { contributionAmount: c, size, joinSeq } = input;
  const minPaid = input.minRoundsPaid ?? 2;
  if (joinSeq < 1 || joinSeq > size) throw new Error("join round out of range");
  let turnSeq = input.seatTurnSeq;
  const paidBy = (t: number) => t - joinSeq + 1;
  const swapWithLastTurn = paidBy(turnSeq) < minPaid;
  if (swapWithLastTurn) turnSeq = size;
  if (paidBy(turnSeq) < minPaid) throw new Error("too late to join: cannot pay enough rounds before the last turn");
  const missedRounds = joinSeq - 1;
  const holdback = missedRounds * c;
  return { missedRounds, holdback, payout: c * size - holdback, roundsPaidBeforeCollect: paidBy(turnSeq), swapWithLastTurn, turnSeq };
}
