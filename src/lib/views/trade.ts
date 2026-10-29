import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import type { SwapMessage } from "@/lib/protocol";

/** One swap for a member of its circle: who, which turns, the bonus, the agents' messages, who has signed. */
export async function tradeView(tradeId: string) {
  const d = db();
  const [t] = await d.select().from(s.turnTrades).where(eq(s.turnTrades.id, tradeId));
  if (!t) return null;
  const ids = [t.fromMembership, t.toMembership].filter((x): x is string => !!x);
  const parties = await d.select({ id: s.memberships.id, memberId: s.members.id, name: s.members.name, score: s.members.circleScore }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(inArray(s.memberships.id, ids));
  const all = await d.select({ id: s.memberships.id, name: s.members.name }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, t.circleId));
  const nameOf = (id: string) => all.find((p) => p.id === id)?.name ?? "A member";
  const [c] = await d.select({ contribution: s.circles.contributionAmount, size: s.circles.size }).from(s.circles).where(eq(s.circles.id, t.circleId));
  const rs = await d.select({ seq: s.rounds.seq, payoutDueAt: s.rounds.payoutDueAt }).from(s.rounds).where(eq(s.rounds.circleId, t.circleId));
  const dateOf = (seq: number | null) => rs.find((r) => r.seq === seq)?.payoutDueAt ?? null;
  const sigs = t.signaturesJson as Record<string, string>;
  const transcript = (t.transcriptJson as { msg: SwapMessage; by: string }[]).map((e, i) => ({ i, by: e.by, speaker: nameOf(e.msg.fromMembership), msg: e.msg }));
  return { trade: t, parties: parties.map((p) => ({ ...p, signed: !!sigs[p.id] })), from: nameOf(t.fromMembership), to: t.toMembership ? nameOf(t.toMembership) : null, pot: c ? c.contribution * c.size : 0, fromDate: dateOf(t.fromRoundSeq), toDate: dateOf(t.toRoundSeq), transcript };
}
