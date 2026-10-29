import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { now } from "@/lib/engine/clock";
import { levelFor, type Language } from "@/lib/protocol";
import { protectionFee } from "@/lib/treasury";

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Everything Shugaba may say about this member, read from the database. Only the member's own
 * details; other members appear as names with "paid / covered by the pool" at most (spec 10.3).
 */
export async function memberFacts(circleId: string, memberId: string) {
  const d = db();
  const [me] = await d.select({ id: s.members.id, name: s.members.name, language: s.members.language, score: s.members.circleScore }).from(s.members).where(eq(s.members.id, memberId));
  const [circle] = await d.select().from(s.circles).where(eq(s.circles.id, circleId));
  const [ms] = await d.select().from(s.memberships).where(and(eq(s.memberships.circleId, circleId), eq(s.memberships.memberId, memberId)));
  if (!me || !circle || !ms) return null;
  const all = await d.select({ id: s.memberships.id, name: s.members.name }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, circleId));
  const nameOf = (id: string | null) => all.find((x) => x.id === id)?.name ?? "someone";
  const rounds = await d.select().from(s.rounds).where(eq(s.rounds.circleId, circleId)).orderBy(asc(s.rounds.seq));
  const mine = await d.select({ c: s.contributions, seq: s.rounds.seq }).from(s.contributions).innerJoin(s.rounds, eq(s.rounds.id, s.contributions.roundId)).where(eq(s.contributions.membershipId, ms.id)).orderBy(asc(s.rounds.seq));
  const [recovery] = await d.select().from(s.recoveries).where(and(eq(s.recoveries.membershipId, ms.id), inArray(s.recoveries.status, ["OPEN", "PARTIAL"]))).orderBy(desc(s.recoveries.createdAt));
  const trades = await d.select().from(s.turnTrades).where(and(eq(s.turnTrades.circleId, circleId), eq(s.turnTrades.status, "AGREED")));
  const at = await now(d);
  const fee = protectionFee(circle.contributionAmount, circle.protectionTier).fee;
  const myTurn = rounds.find((r) => r.recipientMembershipId === ms.id) ?? null;
  const current = rounds.find((r) => r.status !== "PAID_OUT" && r.status !== "SCHEDULED") ?? rounds.find((r) => r.status === "SCHEDULED") ?? null;
  const nextDue = rounds.find((r) => r.status === "SCHEDULED");
  const myCurrent = mine.find((x) => x.seq === current?.seq);
  const tradeForMe = trades.find((t) => t.fromMembership === ms.id || t.toMembership === ms.id);
  return {
    now: day(at),
    member: { name: me.name, language: me.language as Language, score: me.score, level: levelFor(me.score).title },
    circle: { id: circle.id, name: circle.name, status: circle.status, size: circle.size, pot: circle.contributionAmount * circle.size, contribution: circle.contributionAmount, fee, perPayment: circle.contributionAmount + fee, frequency: circle.frequency, graceHours: circle.graceHours, tier: circle.protectionTier },
    myTurn: myTurn ? { seq: myTurn.seq, date: day(myTurn.payoutDueAt), paid: myTurn.status === "PAID_OUT" } : null,
    current: current ? { seq: current.seq, recipient: nameOf(current.recipientMembershipId), status: current.status, payoutDate: day(current.payoutDueAt), graceEnds: day(current.graceEndsAt) } : null,
    nextCollection: nextDue ? day(nextDue.collectionDueAt) : null,
    myPayments: mine.map((x) => ({ round: x.seq, date: day(x.c.updatedAt), amount: x.c.amount + x.c.feeAmount, status: x.c.status })),
    owesNow: myCurrent?.c.status === "FAILED" && current?.status === "GRACE" ? { id: myCurrent.c.id, amount: myCurrent.c.amount + myCurrent.c.feeAmount, until: day(current.graceEndsAt) } : null,
    recovery: recovery ? { id: recovery.id, due: recovery.amountDue, paid: recovery.amountPaid, left: recovery.amountDue - recovery.amountPaid } : null,
    pendingSwap: tradeForMe ? { tradeId: tradeForMe.id, with: nameOf(tradeForMe.fromMembership === ms.id ? tradeForMe.toMembership : tradeForMe.fromMembership), bonus: tradeForMe.bonusAmount } : null,
  };
}

export type MemberFacts = NonNullable<Awaited<ReturnType<typeof memberFacts>>>;
