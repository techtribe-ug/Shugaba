import type { Cents, ProtectionTier } from "@/lib/protocol";
import { DEFAULT_TREASURY_CONFIG, type TreasuryConfig } from "./config";
import { potFor, protectionFee } from "./fees";
import { chainEvent, type ChainedEvent } from "./ledger";
import { settleRound, splitRecoveryPayment, type SeatContribution } from "./settlement";

/**
 * A whole circle cycle run in memory against the treasury rules. Used by property tests and by the
 * demo to explain pool maths. Randomness comes from the plan, so runs are reproducible.
 */
export type SimPlan = {
  size: number;
  contribution: Cents;
  tier: ProtectionTier;
  reserveStart: Cents;
  /** misses[round][seat] = that seat fails to pay in that round. */
  misses: boolean[][];
  /** recoveryPayments[round] = fractions (0..1) of each open recovery paid during that round. */
  recoveryPayments: number[][];
  swap?: { earlySeat: number; lateSeat: number; bonus: Cents } | null;
  config?: TreasuryConfig;
};

export type SimRound = {
  seq: number;
  recipientSeat: number;
  paused: boolean;
  payout: Cents;
  expectedPayout: Cents;
};

export type SimResult = {
  rounds: SimRound[];
  paused: boolean;
  totals: { in: Cents; out: Cents; pool: Cents; bonusHeld: Cents; reserveDelta: Cents; reserveOwed: Cents };
  /** Checked after every step: in = out + pool + held bonuses + reserve change. */
  balanced: boolean;
  poolEverNegative: boolean;
  events: ChainedEvent[];
};

export async function simulateCircle(plan: SimPlan): Promise<SimResult> {
  const config = plan.config ?? DEFAULT_TREASURY_CONFIG;
  const { size, contribution: c, tier } = plan;
  const pot = potFor(c, size);

  // Payout order: seat i collects in round i, unless a swap moves `lateSeat` into `earlySeat`'s turn.
  const order = Array.from({ length: size }, (_, i) => i);
  const swap = plan.swap ?? null;
  if (swap) {
    order[swap.earlySeat] = swap.lateSeat;
    order[swap.lateSeat] = swap.earlySeat;
  }

  let totalIn = 0;
  let totalOut = 0;
  let pool = 0;
  let bonusHeld = 0;
  let reserve = plan.reserveStart;
  let reserveOwed = 0;
  let balanced = true;
  let poolEverNegative = false;
  const collected = new Set<number>();
  const openMisses = new Map<number, number>();
  const recoveries: { seat: number; due: Cents; paid: Cents }[] = [];
  const rounds: SimRound[] = [];
  const events: ChainedEvent[] = [];
  let paused = false;

  const t0 = Date.UTC(2026, 10, 1);
  const log = async (type: string, payload: Record<string, unknown>) => {
    const prev = events.at(-1) ?? null;
    events.push(
      await chainEvent(prev, {
        seq: events.length + 1,
        circleId: "sim",
        type,
        payload,
        actor: "worker",
        createdAt: new Date(t0 + events.length * 1000).toISOString(),
      }),
    );
  };
  const check = () => {
    if (totalIn !== totalOut + pool + bonusHeld + (reserve - plan.reserveStart)) balanced = false;
    if (pool < 0 || bonusHeld < 0) poolEverNegative = true;
  };

  for (let r = 0; r < size && !paused; r++) {
    const recipient = order[r]!;
    const seats: SeatContribution[] = [];
    for (let s = 0; s < size; s++) {
      const miss = plan.misses[r]?.[s] ?? false;
      if (!miss) {
        const fee = protectionFee(c, tier, config);
        totalIn += c + fee.fee;
        pool += fee.toPool;
        reserve += fee.toReserve;
        // Contribution cash is held for this round's payout until settlement.
        pool += c;
        await log("CONTRIBUTION_PAID", { seat: s, amount: c, fee: fee.fee });
      } else {
        await log("CONTRIBUTION_FAILED", { seat: s });
      }
      seats.push({
        membershipId: `m${s}`,
        amount: c,
        status: miss ? "FAILED" : "PAID",
        alreadyCollected: collected.has(s),
        openMisses: openMisses.get(s) ?? 0,
      });
    }
    check();

    // Round cash sits in the pool above; settlement sees only the free pool.
    const roundCash = seats.filter((s) => s.status === "PAID").length * c;
    const freePool = pool - roundCash;
    const bonusPaid = swap && recipient === swap.lateSeat && swap.bonus > 0 ? { tradeId: "t1", amount: swap.bonus, forMembershipId: `m${swap.earlySeat}` } : null;
    const bonusReleases = swap && recipient === swap.earlySeat && swap.bonus > 0 && bonusHeld >= swap.bonus ? [{ tradeId: "t1", amount: swap.bonus }] : [];
    const res = settleRound({
      roundId: `r${r}`,
      recipientMembershipId: `m${recipient}`,
      contributionAmount: c,
      size,
      tier,
      seats,
      poolBalance: freePool,
      bonusHeldBalance: bonusHeld,
      reserveBalance: reserve,
      bonusPaid,
      bonusReleases,
      config,
    });
    const expectedPayout = pot - (bonusPaid?.amount ?? 0) + bonusReleases.reduce((a, b) => a + b.amount, 0);

    if (res.pause) {
      paused = true;
      pool = freePool + roundCash; // nothing moves; cash waits for the operator
      await log("CIRCLE_PAUSED", { reason: res.reason });
      rounds.push({ seq: r + 1, recipientSeat: recipient, paused: true, payout: 0, expectedPayout });
      check();
      break;
    }

    pool = res.poolAfter;
    bonusHeld = res.bonusHeldAfter;
    reserve = res.reserveAfter;
    reserveOwed += res.reserveOwedIncrease;
    totalOut += res.payoutAmount;
    collected.add(recipient);
    for (const cv of res.covers) await log("POOL_COVER", { ...cv });
    for (const nr of res.newRecoveries) {
      const seat = Number(nr.membershipId.slice(1));
      recoveries.push({ seat, due: nr.amountDue, paid: 0 });
      openMisses.set(seat, (openMisses.get(seat) ?? 0) + 1);
      await log("RECOVERY_OPENED", { seat, amountDue: nr.amountDue });
    }
    await log("PAYOUT_SENT", { round: r + 1, seat: recipient, amount: res.payoutAmount });
    rounds.push({ seq: r + 1, recipientSeat: recipient, paused: false, payout: res.payoutAmount, expectedPayout });
    check();

    // Recovery payments during this round.
    const fractions = plan.recoveryPayments[r] ?? [];
    for (let i = 0; i < recoveries.length; i++) {
      const rec = recoveries[i]!;
      const f = fractions[i % Math.max(1, fractions.length)] ?? 0;
      const remaining = rec.due - rec.paid;
      const amount = Math.min(remaining, Math.ceil(remaining * Math.min(1, Math.max(0, f))));
      if (amount <= 0) continue;
      const split = splitRecoveryPayment(amount, reserveOwed);
      reserveOwed -= split.toReserve;
      reserve += split.toReserve;
      pool += split.toPool;
      totalIn += amount;
      rec.paid += amount;
      if (rec.paid >= rec.due) openMisses.set(rec.seat, Math.max(0, (openMisses.get(rec.seat) ?? 1) - 1));
      await log("RECOVERY_PAYMENT", { seat: rec.seat, amount, ...split });
      check();
    }
  }

  return {
    rounds,
    paused,
    totals: { in: totalIn, out: totalOut, pool, bonusHeld, reserveDelta: reserve - plan.reserveStart, reserveOwed },
    balanced,
    poolEverNegative,
    events,
  };
}
