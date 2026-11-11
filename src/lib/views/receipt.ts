import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

/** One contribution as a receipt: amounts, PayPal reference, the verified webhook and the signed ledger entry. Own data only. */
export async function receiptView(circleId: string, memberId: string, contributionId: string) {
  const d = db();
  const [row] = await d
    .select({ c: s.contributions, round: s.rounds, circle: s.circles, member: s.members })
    .from(s.contributions)
    .innerJoin(s.rounds, eq(s.rounds.id, s.contributions.roundId))
    .innerJoin(s.circles, eq(s.circles.id, s.rounds.circleId))
    .innerJoin(s.memberships, eq(s.memberships.id, s.contributions.membershipId))
    .innerJoin(s.members, eq(s.members.id, s.memberships.memberId))
    .where(and(eq(s.contributions.id, contributionId), eq(s.circles.id, circleId), eq(s.members.id, memberId)));
  if (!row) return null;
  const { c, round, circle, member } = row;

  const [entry] = await d
    .select({ circleSeq: s.ledgerEvents.circleSeq, hash: s.ledgerEvents.hash, at: s.ledgerEvents.createdAt })
    .from(s.ledgerEvents)
    .where(and(eq(s.ledgerEvents.circleId, circleId), eq(s.ledgerEvents.type, "CONTRIBUTION_PAID"), sql`${s.ledgerEvents.payloadJson}->>'contributionId' = ${c.id}`))
    .orderBy(desc(s.ledgerEvents.seq))
    .limit(1);

  const [hook] = c.providerRef
    ? await d
        .select({ type: s.webhookEvents.type, verified: s.webhookEvents.verified, at: s.webhookEvents.createdAt })
        .from(s.webhookEvents)
        .where(sql`${s.webhookEvents.payload}->'resource'->>'id' = ${c.providerRef}`)
        .orderBy(desc(s.webhookEvents.createdAt))
        .limit(1)
    : [];

  return {
    id: c.id,
    status: c.status,
    amount: c.amount,
    fee: c.feeAmount,
    total: c.amount + c.feeAmount,
    ref: c.providerRef,
    failureReason: c.failureReason,
    at: entry?.at ?? c.updatedAt,
    round: round.seq,
    circle: circle.name,
    member: { name: member.name, paypalEmail: member.paypalEmail },
    ledger: entry ? { seq: entry.circleSeq, hash: entry.hash } : null,
    webhook: hook ?? null,
  };
}
