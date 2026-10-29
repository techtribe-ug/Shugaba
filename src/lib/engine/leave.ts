import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db as getDb, type Tx } from "@/lib/db/client";
import { appendLedger } from "@/lib/db/ledger";
import * as s from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";
import { publish } from "@/lib/realtime/bus";
import { lateJoinTerms, protectionFee } from "@/lib/treasury";
import { now } from "./clock";
import { signAndJoin, startMandate } from "./circles";
import { changeScore } from "./score";
import { EngineError, memberActor } from "./types";

const IN_PROGRESS = ["COLLECTING", "GRACE", "SETTLING", "HELD"] as const;
const PAID_IN = ["PAID", "LATE", "RECOVERED"] as const;

export type LeaveTerms =
  | { kind: "forming" }
  | { kind: "refund"; paidIn: number; feesKept: number; refund: number; when: Date; shortNotice: boolean; noticeBy: Date | null }
  | { kind: "owes"; collected: number; collectedAt: Date | null; stillToPay: number; perTurn: number; turnsLeft: number }
  | { kind: "blocked"; reason: string };

async function loadMembership(tx: Tx, membershipId: string) {
  const [m] = await tx.select().from(s.memberships).where(eq(s.memberships.id, membershipId));
  if (!m) throw new EngineError("NOT_FOUND", "membership not found");
  const [c] = await tx.select().from(s.circles).where(eq(s.circles.id, m.circleId));
  return { m, circle: c! };
}

/** What leaving would mean for this member right now (spec 8.7, design GLeave). Changes nothing. */
export async function leaveTerms(membershipId: string, tx: Tx = getDb() as unknown as Tx): Promise<LeaveTerms> {
  const { m, circle } = await loadMembership(tx, membershipId);
  if (m.status === "LEFT") return { kind: "blocked", reason: "You already left this circle." };
  if (circle.status === "FORMING") return { kind: "forming" };
  if (circle.status === "COMPLETED") return { kind: "blocked", reason: "This circle has finished." };

  const trades = await tx.select({ id: s.turnTrades.id }).from(s.turnTrades).where(and(eq(s.turnTrades.circleId, circle.id), inArray(s.turnTrades.status, ["NEGOTIATING", "AGREED", "CONFIRMED"]), or(eq(s.turnTrades.fromMembership, m.id), eq(s.turnTrades.toMembership, m.id))));
  if (trades.length) return { kind: "blocked", reason: "Finish your turn swap first." };
  const owing = await tx.select({ id: s.recoveries.id }).from(s.recoveries).where(and(eq(s.recoveries.membershipId, m.id), inArray(s.recoveries.status, ["OPEN", "PARTIAL"])));
  if (owing.length) return { kind: "blocked", reason: "Pay back what you owe the pool first." };

  const rounds = await tx.select().from(s.rounds).where(eq(s.rounds.circleId, circle.id)).orderBy(asc(s.rounds.seq));
  const mine = rounds.find((r) => r.recipientMembershipId === m.id);
  const contribs = await tx.select().from(s.contributions).where(eq(s.contributions.membershipId, m.id));
  const inProgress = rounds.find((r) => (IN_PROGRESS as readonly string[]).includes(r.status));

  if (mine?.status === "PAID_OUT") {
    const turnsLeft = rounds.filter((r) => r.status === "SCHEDULED").length;
    const [p] = await tx.select().from(s.payouts).where(eq(s.payouts.roundId, mine.id));
    return { kind: "owes", collected: p?.amount ?? circle.contributionAmount * circle.size, collectedAt: p?.createdAt ?? null, stillToPay: turnsLeft * circle.contributionAmount, perTurn: circle.contributionAmount, turnsLeft };
  }
  if (!mine || mine.status !== "SCHEDULED") return { kind: "blocked", reason: "Your payout is being paid right now. Try again after it lands." };
  const paid = contribs.filter((c) => (PAID_IN as readonly string[]).includes(c.status));
  const paidIn = paid.reduce((a, c) => a + c.amount + c.feeAmount, 0);
  const feesKept = paid.reduce((a, c) => a + c.feeAmount, 0);
  const next = rounds.find((r) => r.status === "SCHEDULED");
  return { kind: "refund", paidIn, feesKept, refund: paidIn - feesKept, when: mine.payoutDueAt, shortNotice: !!inProgress, noticeBy: inProgress ? null : (next?.collectionDueAt ?? null) };
}

/**
 * Leave a circle (spec 8.7). Before the circle starts: free. Before collecting: the seat opens and what
 * they paid in (less fees) is refunded on their payout date. After collecting: what they still owe
 * becomes one recovery invoice, and the pool covers their seat until it is paid.
 */
export async function leaveCircle(membershipId: string, actorMemberId: string) {
  const db = getDb();
  const out = await db.transaction(async (tx) => {
    const { m, circle } = await loadMembership(tx, membershipId);
    if (m.memberId !== actorMemberId) throw new EngineError("FORBIDDEN", "only the member can leave");
    await tx.select().from(s.circles).where(eq(s.circles.id, circle.id)).for("update");
    const terms = await leaveTerms(membershipId, tx);
    const at = await now(tx);
    if (terms.kind === "blocked") throw new EngineError("CONFLICT", terms.reason);

    await appendLedger(tx, circle.id, { type: "MEMBER_LEFT", membershipId }, memberActor(actorMemberId), at);
    if (terms.kind === "forming") {
      await tx.delete(s.collectionMandates).where(eq(s.collectionMandates.membershipId, membershipId));
      await tx.delete(s.memberships).where(eq(s.memberships.id, membershipId));
      return { circleId: circle.id, terms, recoveryId: null };
    }

    // Any unpaid contribution in the round being collected now becomes part of the open seat.
    await tx.delete(s.contributions).where(and(eq(s.contributions.membershipId, membershipId), inArray(s.contributions.status, ["SCHEDULED", "FAILED"])));
    await tx.update(s.memberships).set({ status: "LEFT", leftAt: at, refundDue: terms.kind === "refund" ? terms.refund : 0, updatedAt: new Date() }).where(eq(s.memberships.id, membershipId));
    await tx.update(s.collectionMandates).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(s.collectionMandates.membershipId, membershipId));

    let recoveryId: string | null = null;
    if (terms.kind === "refund") {
      const [turn] = await tx.select().from(s.rounds).where(and(eq(s.rounds.circleId, circle.id), eq(s.rounds.recipientMembershipId, membershipId)));
      await appendLedger(tx, circle.id, { type: "SEAT_OPENED", seq: turn!.seq }, "worker", at);
      await appendLedger(tx, circle.id, { type: "LEAVER_REFUND_SCHEDULED", membershipId, amount: terms.refund, onRoundSeq: turn!.seq }, "worker", at);
      if (terms.shortNotice) await changeScore(tx, m.memberId, circle.id, "LEFT_SHORT_NOTICE", at);
    } else if (terms.stillToPay > 0) {
      const [first] = await tx.select().from(s.rounds).where(and(eq(s.rounds.circleId, circle.id), eq(s.rounds.status, "SCHEDULED"))).orderBy(asc(s.rounds.seq)).limit(1);
      recoveryId = uuidv7();
      await appendLedger(tx, circle.id, { type: "RECOVERY_OPENED", recoveryId, membershipId, roundId: first!.id, amountDue: terms.stillToPay }, "worker", at);
      await tx.insert(s.recoveries).values({ id: recoveryId, membershipId, roundId: first!.id, amountDue: terms.stillToPay, status: "OPEN" });
    }
    return { circleId: circle.id, terms, recoveryId };
  });
  await publish(out.circleId, "circle.updated");
  return out;
}

/** The open seat a late joiner can take, with the terms shown before they sign (spec 8.7.1). */
export async function openSeat(circleId: string) {
  const db = getDb();
  const [circle] = await db.select().from(s.circles).where(eq(s.circles.id, circleId));
  if (!circle || circle.status !== "ACTIVE") return null;
  const leavers = await db.select().from(s.memberships).where(and(eq(s.memberships.circleId, circleId), eq(s.memberships.status, "LEFT"))).orderBy(asc(s.memberships.leftAt));
  const rounds = await db.select().from(s.rounds).where(eq(s.rounds.circleId, circleId)).orderBy(asc(s.rounds.seq));
  const joinSeq = rounds.find((r) => r.status === "SCHEDULED")?.seq;
  if (!joinSeq) return null;
  for (const l of leavers) {
    const [taken] = await db.select({ id: s.memberships.id }).from(s.memberships).where(eq(s.memberships.replacesMembershipId, l.id));
    if (taken) continue;
    const turn = rounds.find((r) => r.recipientMembershipId === l.id && r.status === "SCHEDULED");
    if (!turn) continue;
    try {
      const terms = lateJoinTerms({ contributionAmount: circle.contributionAmount, size: circle.size, joinSeq, seatTurnSeq: turn.seq });
      const last = rounds[rounds.length - 1]!;
      if (terms.swapWithLastTurn && last.status !== "SCHEDULED") continue;
      return { leaver: l, circle, joinSeq, seatTurnSeq: turn.seq, terms, fee: protectionFee(circle.contributionAmount, circle.protectionTier).fee };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * A newcomer takes an open seat. They pay from the next round, collect on the seat's turn (or the last
 * turn if the seat's turn comes too soon), and missed rounds are held back from their payout.
 */
export async function joinOpenSeat(memberId: string, circleId: string, opts: { returnUrl?: string } = {}) {
  const db = getDb();
  const seat = await openSeat(circleId);
  if (!seat) throw new EngineError("CONFLICT", "no open seat");
  const membershipId = await db.transaction(async (tx) => {
    const at = await now(tx);
    await tx.select().from(s.circles).where(eq(s.circles.id, circleId)).for("update");
    const [already] = await tx.select().from(s.memberships).where(and(eq(s.memberships.circleId, circleId), eq(s.memberships.memberId, memberId)));
    if (already) throw new EngineError("CONFLICT", already.status === "LEFT" ? "you left this circle" : "you are already in this circle");
    const [rules] = await tx.select().from(s.circleRules).where(eq(s.circleRules.circleId, circleId)).orderBy(asc(s.circleRules.version));
    const id = await signAndJoin(tx, circleId, memberId, rules!.hash, at);
    await tx.update(s.memberships).set({ position: seat.leaver.position, joinedRoundSeq: seat.joinSeq, replacesMembershipId: seat.leaver.id, updatedAt: new Date() }).where(eq(s.memberships.id, id));

    // The seat's turn passes to the joiner; if it comes too soon they swap with the last turn.
    const rounds = await tx.select().from(s.rounds).where(eq(s.rounds.circleId, circleId)).orderBy(asc(s.rounds.seq));
    const seatRound = rounds.find((r) => r.seq === seat.seatTurnSeq)!;
    if (seat.terms.swapWithLastTurn) {
      const last = rounds[rounds.length - 1]!;
      await tx.update(s.rounds).set({ recipientMembershipId: last.recipientMembershipId, updatedAt: new Date() }).where(eq(s.rounds.id, seatRound.id));
      await tx.update(s.rounds).set({ recipientMembershipId: id, updatedAt: new Date() }).where(eq(s.rounds.id, last.id));
    } else {
      await tx.update(s.rounds).set({ recipientMembershipId: id, updatedAt: new Date() }).where(eq(s.rounds.id, seatRound.id));
    }
    await appendLedger(tx, circleId, { type: "SEAT_FILLED", membershipId: id, seq: seat.terms.turnSeq, missedRounds: seat.terms.missedRounds }, memberActor(memberId), at);
    return id;
  });
  const mandate = await startMandate(membershipId, opts.returnUrl);
  await publish(circleId, "circle.updated");
  return { membershipId, ...mandate };
}
