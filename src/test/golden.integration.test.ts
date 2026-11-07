/**
 * Golden path, steps 1 to 10, in mock mode against a real Postgres (spec 15, M5).
 * Needs TEST_DATABASE_URL; CI provides one. Skipped otherwise.
 */
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("golden path (mock)", () => {
  let mod: Awaited<ReturnType<typeof load>>;
  async function load() {
    process.env.DATABASE_URL = url;
    process.env.PAYMENT_PROVIDER = "mock";
    const client = await import("@/lib/db/client");
    const { runMigrations } = await import("@/lib/db/migrate-core");
    const { seedDemo } = await import("@/lib/db/seed-core");
    const golden = await import("@/lib/demo/golden");
    const cast = await import("@/lib/demo/cast");
    const s = await import("@/lib/db/schema");
    const { readChain } = await import("@/lib/db/ledger");
    const { verifyChain } = await import("@/lib/treasury");
    const { stableId } = await import("@/lib/ids");
    return { client, runMigrations, seedDemo, golden, cast, s, readChain, verifyChain, stableId };
  }

  beforeAll(async () => {
    mod = await load();
    const conn = mod.client.getConn();
    await conn.sql.unsafe("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
    await mod.runMigrations(conn);
    await mod.seedDemo(conn.db, { clockSpeed: 1 });
    await mod.seedDemo(conn.db, { clockSpeed: 1 }); // idempotent
  }, 60_000);

  const names = async () => {
    const { db } = mod.client.getConn();
    const { s } = mod;
    const rows = await db.select({ seq: s.rounds.seq, name: s.members.name, status: s.rounds.status }).from(s.rounds).innerJoin(s.memberships, eq(s.memberships.id, s.rounds.recipientMembershipId)).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.rounds.circleId, mod.cast.FAMILY_CIRCLE_ID)).orderBy(asc(s.rounds.seq));
    return rows;
  };
  const payouts = async () => {
    const { db } = mod.client.getConn();
    const { s } = mod;
    return db.select({ seq: s.rounds.seq, amount: s.payouts.amount, status: s.payouts.status }).from(s.payouts).innerJoin(s.rounds, eq(s.rounds.id, s.payouts.roundId)).where(eq(s.rounds.circleId, mod.cast.FAMILY_CIRCLE_ID)).orderBy(asc(s.rounds.seq));
  };
  const scoreOf = async (key: "amina" | "musa") => {
    const { db } = mod.client.getConn();
    const [m] = await db.select().from(mod.s.members).where(eq(mod.s.members.id, mod.cast.castId(key)));
    return m!.circleScore;
  };

  it("steps 2-3: join, sign, smart order", async () => {
    await mod.golden.advanceGolden(); // join
    await mod.golden.advanceGolden(); // order
    expect((await names()).map((r) => r.name)).toEqual(["Amina", "Ngozi", "Ifeoma", "Sani", "Tunde", "Musa"]);
  });

  it("steps 4-5: collect round 1 and pay Amina the full $300", async () => {
    await mod.golden.advanceGolden(); // collect
    const { db } = mod.client.getConn();
    const cs = await db.select().from(mod.s.contributions);
    expect(cs).toHaveLength(6);
    expect(cs.every((c) => c.status === "PAID" && c.amount === 5000 && c.feeAmount === 100)).toBe(true);
    await mod.golden.advanceGolden(); // pay out
    expect(await payouts()).toEqual([{ seq: 1, amount: 30000, status: "SUCCEEDED" }]);
  });

  it("steps 6-7: Musa fails, grace, pool covers, Ngozi still gets $300, invoice sent", async () => {
    const before = await scoreOf("musa");
    await mod.golden.advanceGolden(); // collect round 2 with Musa failing
    expect((await mod.golden.goldenState()).step).toBe(6);
    await mod.golden.advanceGolden(); // grace expires, settle
    expect((await payouts()).at(-1)).toEqual({ seq: 2, amount: 30000, status: "SUCCEEDED" });
    const { db } = mod.client.getConn();
    const [rec] = await db.select().from(mod.s.recoveries);
    expect(rec).toMatchObject({ amountDue: 5000, status: "OPEN" });
    expect(rec!.providerInvoiceId).toBeTruthy();
    expect(await scoreOf("musa")).toBe(before - 15);
  });

  it("step 8: Tunde and Ifeoma swap through their agents", async () => {
    expect(await mod.golden.advanceGolden()).toMatch(/swapped/);
    expect((await names()).map((r) => r.name)).toEqual(["Amina", "Ngozi", "Tunde", "Sani", "Ifeoma", "Musa"]);
  });

  it("step 9: Musa pays in two parts; reserve is repaid first", async () => {
    const { db } = mod.client.getConn();
    const [c0] = await db.select().from(mod.s.circles).where(eq(mod.s.circles.id, mod.cast.FAMILY_CIRCLE_ID));
    expect(c0!.reserveOwed).toBeGreaterThan(0);
    await mod.golden.payMusaInvoice(1);
    await mod.golden.payMusaInvoice(2);
    const [rec] = await db.select().from(mod.s.recoveries);
    expect(rec!.status).toBe("PAID");
    const [c1] = await db.select().from(mod.s.circles).where(eq(mod.s.circles.id, mod.cast.FAMILY_CIRCLE_ID));
    expect(c1!.reserveOwed).toBe(0);
  });

  it("step 10: all rounds finish with $295 / $305 bonus payouts; Amina reaches Pillar; chain verifies", async () => {
    for (let i = 0; i < 20 && (await mod.golden.goldenState()).circle?.status !== "COMPLETED"; i++) await mod.golden.advanceGolden();
    expect((await payouts()).map((p) => p.amount)).toEqual([30000, 30000, 29500, 30000, 30500, 30000]);
    expect((await mod.golden.goldenState()).step).toBe(10);
    expect(await scoreOf("amina")).toBeGreaterThanOrEqual(780);
    const { db } = mod.client.getConn();
    const chain = await mod.readChain(db, mod.cast.FAMILY_CIRCLE_ID);
    expect(await mod.verifyChain(chain)).toMatchObject({ ok: true });
    const [c] = await db.select().from(mod.s.circles).where(eq(mod.s.circles.id, mod.cast.FAMILY_CIRCLE_ID));
    expect(c!.bonusHeldBalance).toBe(0);
  });

  it("rate limiter counts per key and window, and refuses past the limit", async () => {
    const { rateLimit, RateLimitError } = await import("@/lib/security/rate-limit");
    for (let i = 0; i < 3; i++) await rateLimit("test:rl", 3, 60);
    await expect(rateLimit("test:rl", 3, 60)).rejects.toBeInstanceOf(RateLimitError);
    await expect(rateLimit("test:other", 3, 60)).resolves.toBeUndefined();
  });

  it("history seed: a payout to a member who changed PayPal in the last 48h is held, and an operator release pays it", async () => {
    const { seedHistory } = await import("@/lib/demo/history");
    const { reviewFlag } = await import("@/lib/engine/fraud");
    const { db } = mod.client.getConn();
    await seedHistory();
    expect(await seedHistory()).toMatchObject({ skipped: true });
    const [abuja] = await db.select().from(mod.s.circles).where(eq(mod.s.circles.name, "Abuja Teachers"));
    expect(abuja!.status).toBe("PAUSED");
    const [held] = await db.select().from(mod.s.rounds).where(and(eq(mod.s.rounds.circleId, abuja!.id), eq(mod.s.rounds.status, "HELD")));
    expect(held).toBeDefined();
    const [flag] = await db.select().from(mod.s.fraudFlags).where(and(eq(mod.s.fraudFlags.circleId, abuja!.id), eq(mod.s.fraudFlags.rule, "METHOD_CHANGED_BEFORE_PAYOUT")));
    await reviewFlag(flag!.id, mod.cast.OPERATOR_ID, "CLEARED", "Member confirmed the change by phone");
    const [after] = await db.select().from(mod.s.circles).where(eq(mod.s.circles.id, abuja!.id));
    expect(after!.status).toBe("ACTIVE");
    const [r] = await db.select().from(mod.s.rounds).where(eq(mod.s.rounds.id, held!.id));
    expect(r!.status).toBe("PAID_OUT");
    for (const c of await db.select({ id: mod.s.circles.id }).from(mod.s.circles)) expect(await mod.verifyChain(await mod.readChain(db, c.id))).toMatchObject({ ok: true });
  }, 120_000);

  describe("leaving and joining late (spec 8.7)", () => {
    const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => mod.stableId(`member:history:${from + i}`));
    async function startCircle(name: string) {
      const e = await import("@/lib/engine");
      const { db } = mod.client.getConn();
      const people = ids(36, 4);
      const c = await e.createCircle(people[0]!, { name, contributionAmount: 10_000, size: 4, frequency: "WEEKLY", protectionTier: "STANDARD", graceHours: 48 });
      const [own] = await db.select().from(mod.s.memberships).where(eq(mod.s.memberships.circleId, c.id));
      await e.startMandate(own!.id);
      for (const id of people.slice(1)) await e.joinCircle(id, c.inviteCode);
      await e.acceptOrderAndStart(c.id, people[0]!);
      const rounds = async () => db.select().from(mod.s.rounds).where(eq(mod.s.rounds.circleId, c.id)).orderBy(asc(mod.s.rounds.seq));
      const play = async (seq: number) => {
        const r = (await rounds()).find((x) => x.seq === seq)!;
        await e.collectRound(r.id);
        await e.settleAndPay(r.id);
      };
      const atTurn = async (seq: number) => (await rounds()).find((x) => x.seq === seq)!.recipientMembershipId!;
      const membership = async (id: string) => (await db.select().from(mod.s.memberships).where(eq(mod.s.memberships.id, id)))[0]!;
      const memberOf = async (membershipId: string) => (await membership(membershipId)).memberId;
      const circle = async () => (await db.select().from(mod.s.circles).where(eq(mod.s.circles.id, c.id)))[0]!;
      const paid = async () => {
        const rs = await rounds();
        const ps = await db.select().from(mod.s.payouts);
        return rs.map((r) => ps.find((p) => p.roundId === r.id)?.amount ?? 0);
      };
      const chainOk = async () => (await mod.verifyChain(await mod.readChain(db, c.id))).ok;
      return { id: c.id, e, play, atTurn, membership, memberOf, circle, paid, chainOk };
    }

    it("leaves before collecting, nobody joins: the seat's turn refunds the leaver and refills the pool", async () => {
      const k = await startCircle("Leave, no joiner");
      await k.play(1);
      const leaver = await k.atTurn(3);
      const terms = await k.e.leaveTerms(leaver);
      expect(terms).toMatchObject({ kind: "refund", refund: 10_000, feesKept: 200, shortNotice: false });
      await k.e.leaveCircle(leaver, await k.memberOf(leaver));
      for (const seq of [2, 3, 4]) await k.play(seq);
      expect(await k.paid()).toEqual([40_000, 40_000, 10_000, 40_000]);
      expect((await k.membership(leaver)).refundPaid).toBe(10_000);
      const c = await k.circle();
      expect(c.status).toBe("COMPLETED");
      expect(c.reserveOwed).toBe(0);
      expect(c.poolBalance).toBe(13 * 150); // every cover repaid; only fees remain
      expect(await k.chainOk()).toBe(true);
    });

    it("a late joiner takes the seat: missed rounds are held back and refund the leaver", async () => {
      const k = await startCircle("Leave, joiner");
      await k.play(1);
      const leaver = await k.atTurn(4);
      await k.e.leaveCircle(leaver, await k.memberOf(leaver));
      const seat = await k.e.openSeat(k.id);
      expect(seat?.terms).toMatchObject({ missedRounds: 1, holdback: 10_000, payout: 30_000, swapWithLastTurn: false });
      const joiner = await k.e.joinOpenSeat(mod.cast.castId("sani"), k.id);
      expect(await k.atTurn(4)).toBe(joiner.membershipId);
      for (const seq of [2, 3, 4]) await k.play(seq);
      expect(await k.paid()).toEqual([40_000, 40_000, 40_000, 30_000]);
      expect((await k.membership(leaver)).refundPaid).toBe(10_000);
      const c = await k.circle();
      expect(c.status).toBe("COMPLETED");
      expect(c.poolBalance).toBe(16 * 150);
      expect(await k.chainOk()).toBe(true);
    });

    it("leaves after collecting: what is still owed becomes one invoice; paying it lets the pool cover the seat", async () => {
      const k = await startCircle("Leave after collecting");
      await k.play(1);
      const leaver = await k.atTurn(1);
      expect(await k.e.leaveTerms(leaver)).toMatchObject({ kind: "owes", stillToPay: 30_000, turnsLeft: 3 });
      const out = await k.e.leaveCircle(leaver, await k.memberOf(leaver));
      await k.e.applyRecoveryPayment(out.recoveryId!, 30_000, "test-leave");
      for (const seq of [2, 3, 4]) await k.play(seq);
      expect(await k.paid()).toEqual([40_000, 40_000, 40_000, 40_000]);
      const c = await k.circle();
      expect(c.status).toBe("COMPLETED");
      expect(c.reserveOwed).toBe(0);
      expect(c.poolBalance).toBe(13 * 150);
      expect(await k.chainOk()).toBe(true);
    });
  });
});
