import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db as getDb, type Tx } from "@/lib/db/client";
import { appendLedger } from "@/lib/db/ledger";
import * as s from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";
import { getPaymentProvider } from "@/lib/paypal";
import { publish } from "@/lib/realtime/bus";
import { completionEvent } from "@/lib/score";
import { afterCollection, protectionFee, settleRound, transitionCircle, transitionRound, type SeatContribution } from "@/lib/treasury";
import { now } from "./clock";
import { poolMove } from "./pool";
import { changeScore } from "./score";
import { EngineError } from "./types";

type RoundRow = typeof s.rounds.$inferSelect;

async function lockRound(tx: Tx, roundId: string) {
  const [r] = await tx.select().from(s.rounds).where(eq(s.rounds.id, roundId)).for("update");
  if (!r) throw new EngineError("NOT_FOUND", "round not found");
  const [c] = await tx.select().from(s.circles).where(eq(s.circles.id, r.circleId)).for("update");
  return { round: r, circle: c! };
}

async function activeSeats(tx: Tx, circleId: string) {
  return tx.select({ m: s.memberships, mandate: s.collectionMandates, member: s.members }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).leftJoin(s.collectionMandates, eq(s.collectionMandates.membershipId, s.memberships.id)).where(and(eq(s.memberships.circleId, circleId), inArray(s.memberships.status, ["ACTIVE", "PAUSED"]))).orderBy(asc(s.memberships.position));
}

/**
 * Collection (spec 6.2): charge every active mandate for contribution + protection fee. Payment calls
 * happen outside the DB transaction; each result is recorded idempotently by (round, membership).
 */
export async function collectRound(roundId: string) {
  const db = getDb();
  const prep = await db.transaction(async (tx) => {
    const { round, circle } = await lockRound(tx, roundId);
    if (round.status !== "SCHEDULED") return null;
    if (circle.status !== "ACTIVE") throw new EngineError("CONFLICT", `circle is ${circle.status}`);
    const at = await now(tx);
    await tx.update(s.rounds).set({ status: transitionRound(round.status, "COLLECTING"), updatedAt: new Date() }).where(eq(s.rounds.id, roundId));
    await appendLedger(tx, circle.id, { type: "ROUND_OPENED", roundId, seq: round.seq, recipientMembershipId: round.recipientMembershipId! }, "worker", at);
    const seats = await activeSeats(tx, circle.id);
    const fee = protectionFee(circle.contributionAmount, circle.protectionTier);
    for (const seat of seats) {
      await tx.insert(s.contributions).values({ id: uuidv7(), roundId, membershipId: seat.m.id, amount: circle.contributionAmount, feeAmount: fee.fee, status: "SCHEDULED" }).onConflictDoNothing();
    }
    return { circle, round, seats, fee };
  });
  if (!prep) return;
  await publish(prep.circle.id, "round.updated", { ids: [roundId] });

  const provider = getPaymentProvider();
  for (const seat of prep.seats) {
    const [contrib] = await db.select().from(s.contributions).where(and(eq(s.contributions.roundId, roundId), eq(s.contributions.membershipId, seat.m.id)));
    if (!contrib || contrib.status !== "SCHEDULED") continue;
    const vaultId = seat.mandate?.status === "ACTIVE" ? seat.mandate.providerVaultId : null;
    const result = vaultId
      ? await provider.chargeVaulted({ vaultId, amount: contrib.amount + contrib.feeAmount, currency: "USD", idempotencyKey: `contrib-${contrib.id}`, customId: `${seat.m.id}:${prep.round.seq}`, description: `${prep.circle.name} round ${prep.round.seq}` })
      : ({ status: "FAILED", providerRef: null, reason: "NO_ACTIVE_MANDATE" } as const);
    await recordChargeResult(contrib.id, result.status === "COMPLETED" ? { paid: true, ref: result.providerRef } : result.status === "PENDING" ? { pending: true, ref: result.providerRef } : { paid: false, reason: result.reason });
  }

  await db.transaction(async (tx) => {
    const { round, circle } = await lockRound(tx, roundId);
    if (round.status !== "COLLECTING") return;
    const at = await now(tx);
    const cs = await tx.select().from(s.contributions).where(eq(s.contributions.roundId, roundId));
    const unpaid = cs.filter((c) => c.status !== "PAID" && c.status !== "LATE");
    const next = afterCollection(unpaid.length === 0);
    await tx.update(s.rounds).set({ status: transitionRound(round.status, next), updatedAt: new Date() }).where(eq(s.rounds.id, roundId));
    if (next === "GRACE") {
      await appendLedger(tx, circle.id, { type: "GRACE_STARTED", roundId, seq: round.seq, graceEndsAt: round.graceEndsAt.toISOString(), unpaid: unpaid.map((u) => u.membershipId) }, "worker", at);
    }
  });
  await publish(prep.circle.id, "round.updated", { ids: [roundId] });
}

/** Records one charge outcome. Safe to call twice (webhook replay or retry). */
export async function recordChargeResult(contributionId: string, r: { paid: true; ref: string } | { pending: true; ref: string } | { paid: false; reason: string }) {
  const db = getDb();
  const circleId = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(s.contributions).where(eq(s.contributions.id, contributionId)).for("update");
    if (!c) throw new EngineError("NOT_FOUND", "contribution not found");
    const { round, circle } = await lockRound(tx, c.roundId);
    const at = await now(tx);
    const [m] = await tx.select().from(s.memberships).where(eq(s.memberships.id, c.membershipId));
    if ("pending" in r) {
      await tx.update(s.contributions).set({ providerRef: r.ref, updatedAt: new Date() }).where(eq(s.contributions.id, c.id));
      return circle.id;
    }
    if (r.paid) {
      if (c.status === "PAID" || c.status === "LATE" || c.status === "RECOVERED") return circle.id;
      if (c.status === "COVERED") return circle.id; // paid after cover: handled as a recovery payment instead
      const late = round.status === "GRACE";
      await appendLedger(tx, circle.id, { type: "CONTRIBUTION_PAID", contributionId: c.id, membershipId: c.membershipId, roundSeq: round.seq, amount: c.amount, fee: c.feeAmount, late }, "worker", at);
      await tx.update(s.contributions).set({ status: late ? "LATE" : "PAID", providerRef: r.ref, failureReason: null, updatedAt: new Date() }).where(eq(s.contributions.id, c.id));
      const fee = protectionFee(c.amount, circle.protectionTier);
      await appendLedger(tx, circle.id, { type: "POOL_FEE_IN", contributionId: c.id, toPool: fee.toPool, toReserve: fee.toReserve }, "worker", at);
      await poolMove(tx, { circleId: circle.id, bucket: "free" }, "FEE_IN", fee.toPool, c.id);
      await poolMove(tx, "reserve", "FEE_IN", fee.toReserve, c.id);
      await changeScore(tx, m!.memberId, circle.id, late ? "PAID_IN_GRACE" : "ON_TIME", at);
    } else {
      if (c.status !== "SCHEDULED") return circle.id;
      await appendLedger(tx, circle.id, { type: "CONTRIBUTION_FAILED", contributionId: c.id, membershipId: c.membershipId, roundSeq: round.seq, reason: r.reason }, "worker", at);
      await tx.update(s.contributions).set({ status: "FAILED", failureReason: r.reason, updatedAt: new Date() }).where(eq(s.contributions.id, c.id));
    }
    return circle.id;
  });
  await publish(circleId, "contribution.updated", { ids: [contributionId] });
}

/**
 * Settlement at payout time: pool and reserve cover what is missing, recoveries open, the full pot
 * (adjusted only by swap bonuses) is paid out, or the round is HELD and the circle PAUSED.
 */
export async function settleAndPay(roundId: string) {
  const db = getDb();
  const out = await db.transaction(async (tx) => {
    const { round, circle } = await lockRound(tx, roundId);
    if (round.status !== "GRACE" && round.status !== "SETTLING" && round.status !== "HELD") return null;
    const at = await now(tx);
    if (round.status === "GRACE") await tx.update(s.rounds).set({ status: transitionRound("GRACE", "SETTLING") }).where(eq(s.rounds.id, roundId));
    if (round.status === "HELD") await tx.update(s.rounds).set({ status: transitionRound("HELD", "SETTLING") }).where(eq(s.rounds.id, roundId));

    const cs = await tx.select().from(s.contributions).where(eq(s.contributions.roundId, roundId));
    const ms = await tx.select().from(s.memberships).where(eq(s.memberships.circleId, circle.id));
    const paidOut = await tx.select({ recipient: s.rounds.recipientMembershipId }).from(s.rounds).where(and(eq(s.rounds.circleId, circle.id), eq(s.rounds.status, "PAID_OUT")));
    const collected = new Set(paidOut.map((p) => p.recipient));
    const open = await tx.select({ membershipId: s.recoveries.membershipId, n: sql<number>`count(*)::int` }).from(s.recoveries).where(and(inArray(s.recoveries.membershipId, ms.map((m) => m.id)), inArray(s.recoveries.status, ["OPEN", "PARTIAL"]))).groupBy(s.recoveries.membershipId);
    const openMisses = new Map(open.map((o) => [o.membershipId, o.n]));
    const seats: SeatContribution[] = cs.map((c) => ({ membershipId: c.membershipId, amount: c.amount, status: c.status, alreadyCollected: collected.has(c.membershipId), openMisses: openMisses.get(c.membershipId) ?? 0 }));

    // Swap bonuses: the recipient pays one (moved earlier) or receives one held for them (moved later).
    const trades = await tx.select().from(s.turnTrades).where(and(eq(s.turnTrades.circleId, circle.id), eq(s.turnTrades.status, "CONFIRMED")));
    const paying = trades.find((t) => t.fromMembership === round.recipientMembershipId && t.toRoundSeq === round.seq && t.bonusAmount > 0);
    const releasing = trades.filter((t) => t.toMembership === round.recipientMembershipId && t.fromRoundSeq === round.seq && t.bonusAmount > 0);
    const [reserve] = await tx.select().from(s.globalReserve).where(eq(s.globalReserve.id, 1)).for("update");

    const res = settleRound({
      roundId,
      recipientMembershipId: round.recipientMembershipId!,
      contributionAmount: circle.contributionAmount,
      size: circle.size,
      tier: circle.protectionTier,
      seats,
      poolBalance: circle.poolBalance,
      bonusHeldBalance: circle.bonusHeldBalance,
      reserveBalance: reserve?.balance ?? 0,
      bonusPaid: paying ? { tradeId: paying.id, amount: paying.bonusAmount, forMembershipId: paying.toMembership! } : null,
      bonusReleases: releasing.map((t) => ({ tradeId: t.id, amount: t.bonusAmount })),
    });

    if (res.pause) {
      await appendLedger(tx, circle.id, { type: "CIRCLE_PAUSED", reason: res.reason }, "worker", at);
      await tx.update(s.rounds).set({ status: transitionRound("SETTLING", "HELD") }).where(eq(s.rounds.id, roundId));
      if (circle.status === "ACTIVE") await tx.update(s.circles).set({ status: transitionCircle("ACTIVE", "PAUSED"), updatedAt: new Date() }).where(eq(s.circles.id, circle.id));
      return { circleId: circle.id, paused: true as const };
    }

    // Covers and recoveries.
    for (const cv of res.covers) {
      const c = cs.find((x) => x.membershipId === cv.membershipId)!;
      if (cv.fromPool > 0) {
        await appendLedger(tx, circle.id, { type: "POOL_COVER", roundId, membershipId: c.membershipId, amount: cv.fromPool }, "worker", at);
        await poolMove(tx, { circleId: circle.id, bucket: "free" }, "COVER_OUT", -cv.fromPool, c.id);
      }
      if (cv.fromReserve > 0) {
        await appendLedger(tx, circle.id, { type: "RESERVE_COVER", roundId, membershipId: c.membershipId, amount: cv.fromReserve }, "worker", at);
        await poolMove(tx, "reserve", "RESERVE_COVER_OUT", -cv.fromReserve, c.id);
      }
      await tx.update(s.contributions).set({ status: "COVERED", updatedAt: new Date() }).where(eq(s.contributions.id, c.id));
    }
    if (res.reserveOwedIncrease > 0) await tx.update(s.circles).set({ reserveOwed: sql`${s.circles.reserveOwed} + ${res.reserveOwedIncrease}` }).where(eq(s.circles.id, circle.id));
    const recoveryIds: string[] = [];
    for (const nr of res.newRecoveries) {
      const id = uuidv7();
      recoveryIds.push(id);
      await appendLedger(tx, circle.id, { type: "RECOVERY_OPENED", recoveryId: id, membershipId: nr.membershipId, roundId, amountDue: nr.amountDue }, "worker", at);
      await tx.insert(s.recoveries).values({ id, membershipId: nr.membershipId, roundId, amountDue: nr.amountDue, status: "OPEN" });
      const m = ms.find((x) => x.id === nr.membershipId)!;
      await changeScore(tx, m.memberId, circle.id, "MISSED", at);
    }

    // Bonuses.
    if (paying && res.bonusHeld > 0) {
      await appendLedger(tx, circle.id, { type: "BONUS_HELD", tradeId: paying.id, amount: res.bonusHeld, forMembershipId: paying.toMembership! }, "worker", at);
      await poolMove(tx, { circleId: circle.id, bucket: "bonus" }, "BONUS_HOLD", res.bonusHeld, paying.id);
    }
    for (const t of releasing) {
      await appendLedger(tx, circle.id, { type: "BONUS_RELEASED", tradeId: t.id, amount: t.bonusAmount, toMembershipId: t.toMembership! }, "worker", at);
      await poolMove(tx, { circleId: circle.id, bucket: "bonus" }, "BONUS_RELEASE", -t.bonusAmount, t.id);
      await tx.update(s.turnTrades).set({ status: "SETTLED", updatedAt: new Date() }).where(eq(s.turnTrades.id, t.id));
    }

    // Payout row, ledger first.
    const payoutId = uuidv7();
    const fromPool = res.coverFromPool + res.coverFromReserve + res.bonusReleased;
    await appendLedger(tx, circle.id, { type: "PAYOUT_SENT", payoutId, roundId, recipientMembershipId: round.recipientMembershipId!, amount: res.payoutAmount, fromPool }, "worker", at);
    await tx.insert(s.payouts).values({ id: payoutId, roundId, amount: res.payoutAmount, fromPoolAmount: fromPool, status: "PENDING" });
    const [recipient] = await tx.select({ email: s.members.paypalEmail, fallback: s.members.email }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.id, round.recipientMembershipId!));
    return { circleId: circle.id, paused: false as const, payoutId, amount: res.payoutAmount, recipientEmail: recipient!.email ?? recipient!.fallback, seq: round.seq, recoveryIds, circleName: circle.name };
  });
  if (!out) return null;
  await publish(out.circleId, "pool.updated");
  if (out.paused) {
    await publish(out.circleId, "circle.updated");
    return out;
  }

  // Money leaves through PayPal Payouts. sender_batch_id = round id, sender_item_id = payout id.
  const result = await getPaymentProvider().sendPayout({ recipientEmail: out.recipientEmail, amount: out.amount, currency: "USD", senderItemId: out.payoutId, senderBatchId: roundId, note: `${out.circleName}: round ${out.seq} payout` });
  await db.update(s.payouts).set({ providerBatchId: result.batchId, providerItemId: result.itemId || null, status: result.status === "FAILED" ? "FAILED" : "SENT", updatedAt: new Date() }).where(eq(s.payouts.id, out.payoutId));
  if (result.status === "SUCCESS") await confirmPayout(out.payoutId);
  for (const id of out.recoveryIds) {
    const { sendRecoveryInvoice } = await import("./recovery");
    await sendRecoveryInvoice(id).catch((e) => console.error("[recovery] invoice failed", e));
  }
  return out;
}

/** Payout succeeded (sync in mock mode, webhook in sandbox). Idempotent. */
export async function confirmPayout(payoutId: string) {
  const db = getDb();
  const circleId = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(s.payouts).where(eq(s.payouts.id, payoutId)).for("update");
    if (!p || p.status === "SUCCEEDED") return null;
    const { round, circle } = await lockRound(tx, p.roundId);
    const at = await now(tx);
    await appendLedger(tx, circle.id, { type: "PAYOUT_CONFIRMED", payoutId, roundId: round.id }, "worker", at);
    await tx.update(s.payouts).set({ status: "SUCCEEDED", updatedAt: new Date() }).where(eq(s.payouts.id, payoutId));
    await tx.update(s.rounds).set({ status: transitionRound(round.status, "PAID_OUT"), updatedAt: new Date() }).where(eq(s.rounds.id, round.id));
    const remaining = await tx.select({ id: s.rounds.id }).from(s.rounds).where(and(eq(s.rounds.circleId, circle.id), sql`${s.rounds.status} <> 'PAID_OUT'`, sql`${s.rounds.id} <> ${round.id}`));
    if (remaining.length === 0) await completeCircle(tx, circle, at);
    return circle.id;
  });
  if (circleId) {
    await publish(circleId, "payout.completed", { ids: [payoutId] });
    await publish(circleId, "round.updated");
  }
}

async function completeCircle(tx: Tx, circle: typeof s.circles.$inferSelect, at: Date) {
  await appendLedger(tx, circle.id, { type: "CIRCLE_COMPLETED" }, "worker", at);
  await tx.update(s.circles).set({ status: transitionCircle(circle.status, "COMPLETED"), updatedAt: new Date() }).where(eq(s.circles.id, circle.id));
  const ms = await tx.select().from(s.memberships).where(eq(s.memberships.circleId, circle.id));
  for (const m of ms) {
    if (m.position == null) continue;
    // Only members with nothing outstanding get the completion bonus.
    const owing = await tx.select({ id: s.recoveries.id }).from(s.recoveries).where(and(eq(s.recoveries.membershipId, m.id), inArray(s.recoveries.status, ["OPEN", "PARTIAL"])));
    if (owing.length) continue;
    await changeScore(tx, m.memberId, circle.id, completionEvent(m.position, circle.size), at);
  }
}

/** Rounds whose time has come, by the app clock. */
export async function dueWork(at: Date): Promise<{ collect: RoundRow[]; settle: RoundRow[] }> {
  const db = getDb();
  const active = db.select({ id: s.circles.id }).from(s.circles).where(eq(s.circles.status, "ACTIVE"));
  const collect = await db.select().from(s.rounds).where(and(eq(s.rounds.status, "SCHEDULED"), lt(s.rounds.collectionDueAt, at), inArray(s.rounds.circleId, active))).orderBy(asc(s.rounds.collectionDueAt));
  const settle = await db.select().from(s.rounds).where(and(inArray(s.rounds.status, ["GRACE", "SETTLING"]), lt(s.rounds.payoutDueAt, at), inArray(s.rounds.circleId, active))).orderBy(asc(s.rounds.payoutDueAt));
  return { collect, settle };
}
