import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { potFor, simulateCircle, swapBonusCap, verifyChain, type SimPlan } from "./index";

const RUNS = Number(process.env.PROPERTY_RUNS ?? 1000);

const planArb: fc.Arbitrary<SimPlan> = fc
  .record({
    size: fc.integer({ min: 3, max: 12 }),
    contribution: fc.integer({ min: 100, max: 100_000 }),
    tier: fc.constantFrom("BASIC" as const, "STANDARD" as const, "PLUS" as const),
    reserveStart: fc.integer({ min: 0, max: 2_000_000 }),
    missRate: fc.double({ min: 0, max: 0.35, noNaN: true }),
    seed: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 144, maxLength: 144 }),
    recoveryPayments: fc.array(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 4 }), { maxLength: 12 }),
    swapPick: fc.option(fc.tuple(fc.nat(), fc.nat(), fc.double({ min: 0, max: 1, noNaN: true })), { nil: null }),
  })
  .map((p) => {
    const misses = Array.from({ length: p.size }, (_, r) => Array.from({ length: p.size }, (_, s) => p.seed[(r * 12 + s) % 144]! < p.missRate));
    let swap: SimPlan["swap"] = null;
    if (p.swapPick) {
      const a = p.swapPick[0] % p.size;
      const b = p.swapPick[1] % p.size;
      if (a !== b) swap = { earlySeat: Math.min(a, b), lateSeat: Math.max(a, b), bonus: Math.floor(swapBonusCap(potFor(p.contribution, p.size)) * p.swapPick[2]) };
    }
    return { size: p.size, contribution: p.contribution, tier: p.tier, reserveStart: p.reserveStart, misses, recoveryPayments: p.recoveryPayments, swap };
  });

describe("treasury properties", () => {
  it(`every payout is full or the circle pauses; the ledger balances to the cent (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(planArb, async (plan) => {
        const res = await simulateCircle(plan);
        for (const r of res.rounds) {
          if (!r.paused) expect(r.payout).toBe(r.expectedPayout);
          else expect(r.payout).toBe(0);
        }
        // Every round paid out unless the circle paused.
        if (!res.paused) expect(res.rounds).toHaveLength(plan.size);
        expect(res.balanced).toBe(true);
        expect(res.poolEverNegative).toBe(false);
        expect(res.totals.reserveOwed).toBeGreaterThanOrEqual(0);
        // in = out + pool + held bonuses + reserve change
        const t = res.totals;
        expect(t.in).toBe(t.out + t.pool + t.bonusHeld + t.reserveDelta);
      }),
      { numRuns: RUNS },
    );
  });

  it(`the hash chain always verifies, and any tampering is caught (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(planArb, fc.nat(), async (plan, pick) => {
        const res = await simulateCircle(plan);
        expect((await verifyChain(res.events)).ok).toBe(true);
        if (res.events.length === 0) return;
        const i = pick % res.events.length;
        const tampered = res.events.slice();
        tampered[i] = { ...tampered[i]!, payload: { ...(tampered[i]!.payload as object), tampered: true } };
        const v = await verifyChain(tampered);
        expect(v).toMatchObject({ ok: false, brokenSeq: i + 1 });
      }),
      { numRuns: RUNS },
    );
  });

  it("with no misses, every member gets the full pot (bonus aside)", async () => {
    await fc.assert(
      fc.asyncProperty(planArb, async (plan) => {
        const res = await simulateCircle({ ...plan, misses: [] });
        expect(res.paused).toBe(false);
        const total = res.rounds.reduce((a, r) => a + r.payout, 0);
        expect(total).toBe(potFor(plan.contribution, plan.size) * plan.size);
      }),
      { numRuns: 200 },
    );
  });
});
