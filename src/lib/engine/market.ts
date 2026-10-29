import { and, eq } from "drizzle-orm";
import { negotiate, type Rationale } from "@/lib/agents/market";
import { db as getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { AgentPrefs } from "@/lib/protocol";
import { appendTranscript, markAgreed, openSwapRequest } from "./trades";
import { EngineError } from "./types";

/**
 * A member asks for an earlier turn (spec 10.4). Their agent runs the Turn Market inside everyone's
 * prefs; agreed terms go through the validator and then wait for both humans to sign.
 * `targetSeq` is set when the member dragged their payout onto one specific turn in the calendar.
 */
export async function requestSwap(input: { circleId: string; memberId: string; reason: string; targetSeq?: number; rationale?: Rationale }) {
  const db = getDb();
  const [mine] = await db.select().from(s.memberships).where(and(eq(s.memberships.circleId, input.circleId), eq(s.memberships.memberId, input.memberId)));
  if (!mine) throw new EngineError("FORBIDDEN", "not in this circle");
  const [circle] = await db.select().from(s.circles).where(eq(s.circles.id, input.circleId));
  if (!circle || circle.status !== "ACTIVE") throw new EngineError("CONFLICT", "turns can only be swapped while the circle is running");
  const rounds = await db.select().from(s.rounds).where(eq(s.rounds.circleId, input.circleId));
  const target = input.targetSeq ? rounds.find((r) => r.seq === input.targetSeq) : undefined;
  if (input.targetSeq && (!target || target.status !== "SCHEDULED")) throw new EngineError("CONFLICT", "that turn cannot be swapped");

  const trade = await openSwapRequest(input.circleId, mine.id, input.reason);
  if (trade.status !== "NEGOTIATING" || (trade.transcriptJson as unknown[]).length > 1) return { tradeId: trade.id, agreed: trade.status === "AGREED" };

  const ms = await db.select({ m: s.memberships, member: s.members }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, input.circleId));
  const turnOf = (id: string) => rounds.find((r) => r.recipientMembershipId === id);
  const toMarket = (x: (typeof ms)[number]) => {
    const r = turnOf(x.m.id);
    return { membershipId: x.m.id, name: x.member.name, turnSeq: r?.seq ?? 0, collected: !r || r.status !== "SCHEDULED", prefs: AgentPrefs.parse(x.m.agentPrefsJson ?? {}) };
  };
  const me = ms.find((x) => x.m.id === mine.id)!;
  const { transcript, terms } = await negotiate({
    requester: toMarket(me),
    others: ms.filter((x) => x.m.id !== mine.id).map(toMarket),
    pot: circle.contributionAmount * circle.size,
    reason: input.reason,
    rationale: input.rationale,
    targetMembershipId: target?.recipientMembershipId ?? undefined,
  });
  await appendTranscript(trade.id, transcript.slice(1));
  if (!terms) {
    await db.update(s.turnTrades).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(s.turnTrades.id, trade.id));
    return { tradeId: trade.id, agreed: false };
  }
  const v = await markAgreed(trade.id, terms);
  return { tradeId: trade.id, agreed: v.ok };
}
