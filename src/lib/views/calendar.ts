import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { now } from "@/lib/engine/clock";
import { formatCents, levelFor } from "@/lib/protocol";

export type TurnState = "paid" | "today" | "held" | "next" | "later";

const PERSON_LABEL: Record<string, string> = { PAID: "Paid", LATE: "Paid late", FAILED: "Missed", COVERED: "Covered by the pool", RECOVERED: "Paid back", SCHEDULED: "Due" };

/** Payout calendar (spec 11.3): one row per turn, the recipient, the amount, how each member paid. */
export async function calendarView(circleId: string, viewerId: string) {
  const d = db();
  const [circle] = await d.select().from(s.circles).where(eq(s.circles.id, circleId));
  if (!circle) return null;
  const ms = await d.select({ id: s.memberships.id, memberId: s.members.id, name: s.members.name, score: s.members.circleScore }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, circleId));
  const rounds = await d.select().from(s.rounds).where(eq(s.rounds.circleId, circleId)).orderBy(asc(s.rounds.seq));
  const ids = rounds.map((r) => r.id);
  const contribs = ids.length ? await d.select().from(s.contributions).where(inArray(s.contributions.roundId, ids)) : [];
  const payouts = ids.length ? await d.select().from(s.payouts).where(inArray(s.payouts.roundId, ids)) : [];
  const trades = await d.select().from(s.turnTrades).where(eq(s.turnTrades.circleId, circleId));
  const at = await now(d);
  const pot = circle.contributionAmount * circle.size;
  const byId = new Map(ms.map((m) => [m.id, m]));
  const me = ms.find((m) => m.memberId === viewerId) ?? null;
  const myRound = me ? rounds.find((r) => r.recipientMembershipId === me.id) ?? null : null;
  const done = trades.filter((t) => t.status === "CONFIRMED" || t.status === "SETTLED");
  const pending = trades.filter((t) => t.status === "NEGOTIATING" || t.status === "AGREED");
  const nextSeq = rounds.find((r) => r.status !== "PAID_OUT")?.seq ?? null;

  const turns = rounds.map((r) => {
    const who = byId.get(r.recipientMembershipId ?? "");
    const paidOut = payouts.find((p) => p.roundId === r.id);
    // Planned amount: the early taker of a swap gives up the bonus; the member who moved later gets it.
    const gave = done.find((t) => t.toRoundSeq === r.seq && t.fromMembership === r.recipientMembershipId)?.bonusAmount ?? 0;
    const got = done.find((t) => t.fromRoundSeq === r.seq && t.toMembership === r.recipientMembershipId)?.bonusAmount ?? 0;
    const amount = paidOut?.amount ?? pot - gave + got;
    const state: TurnState = r.status === "PAID_OUT" ? "paid" : r.status === "HELD" ? "held" : r.seq === nextSeq && r.status !== "SCHEDULED" ? "today" : r.seq === nextSeq ? "next" : "later";
    const rc = contribs.filter((c) => c.roundId === r.id);
    const missed = rc.filter((c) => c.status === "FAILED" || c.status === "COVERED" || c.status === "RECOVERED").map((c) => byId.get(c.membershipId)?.name);
    const summary =
      state === "paid" ? (missed.length ? `Paid in full. The pool covered ${missed.join(", ")}.` : "Paid in full.")
      : state === "held" ? "Paused while an operator checks a payment."
      : state === "today" ? `${rc.filter((c) => c.status === "PAID" || c.status === "LATE").length} of ${circle.size} have paid in.`
      : gave ? `Includes a ${formatCents(gave)} swap bonus, held for later.`
      : got ? `Includes a ${formatCents(got)} swap bonus.`
      : "";
    const swap = pending.find((t) => t.toRoundSeq === r.seq || t.fromRoundSeq === r.seq);
    return {
      seq: r.seq,
      date: r.payoutDueAt.toISOString(),
      who: who?.name ?? "–",
      whoMemberId: who?.memberId ?? null,
      level: levelFor(who?.score ?? 550),
      isMine: !!me && r.recipientMembershipId === me.id,
      amount,
      state,
      summary,
      missed: missed.length > 0,
      swap: swap ? { tradeId: swap.id, with: byId.get(swap.fromMembership === r.recipientMembershipId ? swap.toMembership ?? "" : swap.fromMembership)?.name ?? null } : null,
      // Dragging my payout onto an earlier turn that is still open asks that member's agent for a swap.
      canTarget: !!myRound && myRound.status === "SCHEDULED" && r.status === "SCHEDULED" && r.seq < myRound.seq && circle.status === "ACTIVE",
      people: ms.map((m) => {
        const c = rc.find((x) => x.membershipId === m.id);
        return { name: m.name, label: c ? PERSON_LABEL[c.status] ?? c.status : r.status === "PAID_OUT" ? "–" : "Due", status: c?.status ?? "SCHEDULED" };
      }),
    };
  });
  const today = turns.find((t) => t.state === "today" || t.state === "held") ?? null;
  const last = [...turns].reverse().find((t) => t.state === "paid") ?? null;
  const line = today ? `${today.who} gets ${formatCents(today.amount)} ${today.state === "held" ? "once the check is done" : "this round"}.` : last ? `${last.who} got ${formatCents(last.amount)}.` : circle.status === "FORMING" ? "The calendar starts when everyone has joined." : "";
  return { circle: { id: circle.id, name: circle.name, status: circle.status }, turns, line, now: at.toISOString(), myTurnSeq: myRound?.status === "SCHEDULED" ? myRound.seq : null };
}

export type CalendarView = NonNullable<Awaited<ReturnType<typeof calendarView>>>;
