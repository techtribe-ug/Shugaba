import { describe, expect, it } from "vitest";
import {
  afterCollection,
  advanceClock,
  breakEvenFeeRate,
  canonicalJson,
  chainEvent,
  clockNow,
  lateJoinTerms,
  protectionFee,
  settleRound,
  splitRecoveryPayment,
  swapBonusCap,
  transitionCircle,
  transitionRound,
  validateTrade,
  verifyChain,
  type ChainedEvent,
  type SeatContribution,
  type TradeContext,
} from "./index";
import { circleTransitions, roundTransitions } from "./state-machines";

const seats = (n: number, c: number, failed: number[] = []): SeatContribution[] =>
  Array.from({ length: n }, (_, i) => ({ membershipId: `m${i}`, amount: c, status: failed.includes(i) ? "FAILED" : "PAID" }));

describe("fees", () => {
  it("golden path: $50 at Standard is a $1 fee, 75/25 split", () => {
    expect(protectionFee(5000, "STANDARD")).toEqual({ fee: 100, toPool: 75, toReserve: 25 });
  });
  it("floors the fee and gives remainder cents to the pool", () => {
    const f = protectionFee(3333, "PLUS"); // 99.99 -> 99
    expect(f.fee).toBe(99);
    expect(f.toReserve).toBe(24);
    expect(f.toPool).toBe(75);
  });
  it("rejects non-integer money", () => {
    expect(() => protectionFee(50.5, "BASIC")).toThrow();
  });
  it("caps swap bonus at 5% of the pot", () => {
    expect(swapBonusCap(30000)).toBe(1500);
  });
  it("break-even example from the spec is about 1.95%", () => {
    expect(breakEvenFeeRate(0.03, 0.5, 0.3)).toBeCloseTo(0.0195, 4);
  });
});

describe("state machines", () => {
  it("walks the happy paths", () => {
    expect(transitionCircle("DRAFT", "FORMING")).toBe("FORMING");
    expect(transitionCircle("FORMING", "ACTIVE")).toBe("ACTIVE");
    expect(transitionRound("SCHEDULED", "COLLECTING")).toBe("COLLECTING");
    expect(transitionRound(afterCollection(false), "SETTLING")).toBe("SETTLING");
    expect(afterCollection(true)).toBe("SETTLING");
  });
  it("throws on every illegal transition", () => {
    for (const [from, tos] of Object.entries(circleTransitions)) {
      for (const to of Object.keys(circleTransitions)) {
        if ((tos as string[]).includes(to)) continue;
        expect(() => transitionCircle(from as never, to as never)).toThrow(/Illegal circle/);
      }
    }
    for (const [from, tos] of Object.entries(roundTransitions)) {
      for (const to of Object.keys(roundTransitions)) {
        if ((tos as string[]).includes(to)) continue;
        expect(() => transitionRound(from as never, to as never)).toThrow(/Illegal round/);
      }
    }
  });
});

describe("ledger hash chain", () => {
  async function build(n: number) {
    const out: ChainedEvent[] = [];
    for (let i = 1; i <= n; i++) {
      out.push(await chainEvent(out.at(-1) ?? null, { seq: i, circleId: "c1", type: "X", payload: { i, b: { z: 1, a: 2 } }, actor: "worker", createdAt: `2026-11-01T00:00:0${i % 10}.000Z` }));
    }
    return out;
  }
  it("canonical JSON sorts keys deeply", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
  });
  it("verifies a clean chain and finds the first tampered entry", async () => {
    const chain = await build(8);
    expect(await verifyChain(chain)).toEqual({ ok: true, count: 8 });
    chain[4] = { ...chain[4]!, payload: { i: 999 } };
    expect(await verifyChain(chain)).toMatchObject({ ok: false, brokenSeq: 5 });
  });
});

describe("settleRound: golden path", () => {
  const base = { contributionAmount: 5000, size: 6, tier: "STANDARD" as const, bonusHeldBalance: 0, reserveBalance: 10_000 };

  it("round 1: everyone pays, Amina gets $300", () => {
    const r = settleRound({ ...base, roundId: "r1", recipientMembershipId: "m0", seats: seats(6, 5000), poolBalance: 450 });
    expect(r.pause).toBe(false);
    if (!r.pause) {
      expect(r.payoutAmount).toBe(30000);
      expect(r.covers).toEqual([]);
    }
  });

  it("round 2: Musa misses, pool covers $50, Ngozi still gets $300 and Musa owes $50", () => {
    const r = settleRound({ ...base, roundId: "r2", recipientMembershipId: "m1", seats: seats(6, 5000, [5]), poolBalance: 825, reserveBalance: 1000 });
    expect(r.pause).toBe(true); // $8.25 pool + $10 reserve cannot cover $50: pause, never short-pay
    const withReserve = settleRound({ ...base, roundId: "r2", recipientMembershipId: "m1", seats: seats(6, 5000, [5]), poolBalance: 825, reserveBalance: 100_000 });
    expect(withReserve.pause).toBe(false);
    if (!withReserve.pause) {
      expect(withReserve.payoutAmount).toBe(30000);
      expect(withReserve.coverFromPool).toBe(825);
      expect(withReserve.coverFromReserve).toBe(4175);
      expect(withReserve.newRecoveries).toEqual([{ membershipId: "m5", amountDue: 5000 }]);
      expect(withReserve.reserveOwedIncrease).toBe(4175);
    }
  });

  it("round 3: Tunde moves earlier and pays a $5 bonus: $295 now, $305 to Ifeoma later", () => {
    const early = settleRound({ ...base, roundId: "r3", recipientMembershipId: "tunde", seats: seats(6, 5000), poolBalance: 0, bonusPaid: { tradeId: "t", amount: 500, forMembershipId: "ifeoma" } });
    expect(early.pause).toBe(false);
    if (early.pause) return;
    expect(early.payoutAmount).toBe(29500);
    expect(early.bonusHeldAfter).toBe(500);
    const late = settleRound({ ...base, roundId: "r5", recipientMembershipId: "ifeoma", seats: seats(6, 5000), poolBalance: 0, bonusHeldBalance: early.bonusHeldAfter, bonusReleases: [{ tradeId: "t", amount: 500 }] });
    expect(late.pause).toBe(false);
    if (!late.pause) {
      expect(late.payoutAmount).toBe(30500);
      expect(late.bonusHeldAfter).toBe(0);
    }
  });

  it("pauses instead of short-paying when misses exceed the tier limit", () => {
    const r = settleRound({ ...base, roundId: "r", recipientMembershipId: "m0", seats: seats(6, 5000, [1, 2]), poolBalance: 1_000_000 });
    expect(r).toMatchObject({ pause: true });
  });

  it("BASIC has no reserve backstop", () => {
    const r = settleRound({ ...base, tier: "BASIC", roundId: "r", recipientMembershipId: "m0", seats: seats(6, 5000, [1]), poolBalance: 100, reserveBalance: 1_000_000 });
    expect(r).toMatchObject({ pause: true });
  });

  it("will not cover a member who already collected and keeps missing", () => {
    const s = seats(6, 5000, [0]);
    s[0] = { ...s[0]!, alreadyCollected: true, openMisses: 1 };
    expect(settleRound({ ...base, roundId: "r", recipientMembershipId: "m3", seats: s, poolBalance: 1_000_000 })).toMatchObject({ pause: true });
  });

  it("cannot release more bonus than is held", () => {
    expect(() => settleRound({ ...base, roundId: "r", recipientMembershipId: "m3", seats: seats(6, 5000), poolBalance: 0, bonusReleases: [{ tradeId: "t", amount: 1 }] })).toThrow();
  });

  it("late joiner: Zainab joins in round 3, collects $200, Tunde's $100 is refunded", () => {
    const r = settleRound({ ...base, roundId: "r5", recipientMembershipId: "zainab", seats: seats(6, 5000), poolBalance: 0, lateJoin: { missedRounds: 2, poolRepayDue: 0, leaverMembershipId: "tunde", leaverRefundDue: 10000 } });
    expect(r.pause).toBe(false);
    if (!r.pause) {
      expect(r.payoutAmount).toBe(20000);
      expect(r.holdback).toEqual({ amount: 10000, toPool: 0, toLeaverRefund: 10000 });
      expect(r.payoutAmount + r.holdback.toLeaverRefund).toBe(30000);
    }
  });

  it("late joiner: holdback repays an empty-seat cover first", () => {
    const r = settleRound({ ...base, roundId: "r5", recipientMembershipId: "zainab", seats: seats(6, 5000), poolBalance: 0, lateJoin: { missedRounds: 3, poolRepayDue: 5000, leaverMembershipId: "tunde", leaverRefundDue: 10000 } });
    if (r.pause) throw new Error("paused");
    expect(r.holdback).toEqual({ amount: 15000, toPool: 5000, toLeaverRefund: 10000 });
    expect(r.poolAfter).toBe(5000);
  });

  it("an open seat is covered without opening a recovery", () => {
    const s = seats(6, 5000, [2]);
    s[2] = { ...s[2]!, membershipId: null };
    const r = settleRound({ ...base, roundId: "r", recipientMembershipId: "m0", seats: s, poolBalance: 5000 });
    if (r.pause) throw new Error("paused");
    expect(r.newRecoveries).toEqual([]);
    expect(r.payoutAmount).toBe(30000);
  });
});

describe("recovery", () => {
  it("repays the reserve first, then the pool", () => {
    expect(splitRecoveryPayment(2500, 4175)).toEqual({ toReserve: 2500, toPool: 0 });
    expect(splitRecoveryPayment(2500, 1675)).toEqual({ toReserve: 1675, toPool: 825 });
  });
});

describe("validateTrade", () => {
  const rounds = ["amina", "ngozi", "ifeoma", "sani", "tunde", "musa"].map((m, i) => ({ seq: i + 1, status: (i < 2 ? "PAID_OUT" : "SCHEDULED") as never, recipientMembershipId: m }));
  const ctx: TradeContext = {
    pot: 30000,
    size: 6,
    tier: "STANDARD",
    rounds,
    collected: new Set(["amina", "ngozi"]),
    prefs: {
      tunde: { acceptSwapLater: false, minBonusBps: 0, maxBonus: 500 },
      ifeoma: { acceptSwapLater: true, minBonusBps: 150, latestAcceptableRoundSeq: 6, maxBonus: 0 },
      sani: { acceptSwapLater: false, minBonusBps: 0, maxBonus: 0 },
    },
    scoreTiers: { tunde: "GOLD", ifeoma: "GOLD", sani: "GOLD", musa: "SILVER" },
    signaturesValid: true,
  };
  const golden = { fromMembershipId: "tunde", toMembershipId: "ifeoma", fromRoundSeq: 5, toRoundSeq: 3, bonus: 500 };

  it("accepts the golden-path swap", () => {
    expect(validateTrade(ctx, golden)).toEqual({ ok: true, raiseTierTo: null });
  });
  it("rejects a bonus above the 5% cap even if both agents agree", () => {
    const big = { ...ctx, prefs: { ...ctx.prefs, tunde: { ...ctx.prefs.tunde!, maxBonus: 5000 } } };
    const v = validateTrade(big, { ...golden, bonus: 1600 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join()).toMatch(/cap/);
  });
  it("rejects below the receiver's minimum, a decliner, bad signatures, and collected members", () => {
    expect(validateTrade(ctx, { ...golden, bonus: 400 }).ok).toBe(false);
    expect(validateTrade(ctx, { ...golden, toMembershipId: "sani", toRoundSeq: 4 }).ok).toBe(false);
    expect(validateTrade({ ...ctx, signaturesValid: false }, golden).ok).toBe(false);
    expect(validateTrade(ctx, { ...golden, toMembershipId: "ngozi", toRoundSeq: 2 }).ok).toBe(false);
  });
  it("raises protection to PLUS when a Newcomer moves into the first half", () => {
    const v = validateTrade({ ...ctx, scoreTiers: { ...ctx.scoreTiers, tunde: "BRONZE" } }, golden);
    expect(v).toEqual({ ok: true, raiseTierTo: "PLUS" });
  });
});

describe("late join terms", () => {
  it("spec example: join in round 3, pay 4 x $50, collect $200", () => {
    expect(lateJoinTerms({ contributionAmount: 5000, size: 6, joinSeq: 3, seatTurnSeq: 5 })).toMatchObject({ missedRounds: 2, holdback: 10000, payout: 20000, roundsPaidBeforeCollect: 3, swapWithLastTurn: false });
  });
  it("swaps with the last turn when the seat's turn comes too soon", () => {
    expect(lateJoinTerms({ contributionAmount: 5000, size: 6, joinSeq: 3, seatTurnSeq: 3 })).toMatchObject({ swapWithLastTurn: true, turnSeq: 6 });
  });
});

describe("clock", () => {
  it("runs compressed and only moves forward", () => {
    const s = { anchorMs: 1000, offsetMs: 0, speed: 1440 };
    expect(clockNow(s, 2000).getTime()).toBe(1000 + 1000 * 1440);
    expect(clockNow(advanceClock(s, 60_000), 1000).getTime()).toBe(61_000);
    expect(() => advanceClock(s, -1)).toThrow();
  });
});
