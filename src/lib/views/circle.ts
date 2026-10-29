import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { formatCents, levelFor } from "@/lib/protocol";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { now } from "@/lib/engine/clock";
import { protectionFee } from "@/lib/treasury";

export type SeatState = "paidout" | "now" | "paid" | "late" | "covered" | "due" | "failed" | "open";

/** Everything the circle home needs, already reduced to what a member may see. */
export async function circleView(circleId: string, viewerId: string | null) {
  const d = db();
  const [circle] = await d.select().from(s.circles).where(eq(s.circles.id, circleId));
  if (!circle) return null;
  const ms = await d
    .select({ m: s.memberships, name: s.members.name, score: s.members.circleScore, memberId: s.members.id })
    .from(s.memberships)
    .innerJoin(s.members, eq(s.members.id, s.memberships.memberId))
    .where(eq(s.memberships.circleId, circleId))
    .orderBy(asc(s.memberships.position), asc(s.memberships.createdAt));
  const me = ms.find((x) => x.memberId === viewerId) ?? null;
  const rounds = await d.select().from(s.rounds).where(eq(s.rounds.circleId, circleId)).orderBy(asc(s.rounds.seq));
  const current = rounds.find((r) => r.status !== "PAID_OUT" && r.status !== "SCHEDULED") ?? rounds.find((r) => r.status === "SCHEDULED") ?? null;
  const lastPaid = [...rounds].reverse().find((r) => r.status === "PAID_OUT") ?? null;
  const contribs = current ? await d.select().from(s.contributions).where(eq(s.contributions.roundId, current.id)) : [];
  const payouts = rounds.length ? await d.select().from(s.payouts).where(inArray(s.payouts.roundId, rounds.map((r) => r.id))) : [];
  const collected = new Set(rounds.filter((r) => r.status === "PAID_OUT").map((r) => r.recipientMembershipId));
  const nameOfMembership = new Map(ms.map((x) => [x.m.id, x.name]));
  const at = await now(d);
  const pot = circle.contributionAmount * circle.size;
  const fee = protectionFee(circle.contributionAmount, circle.protectionTier);

  // A member who left: their seat shows as open until someone takes it; then only the newcomer shows.
  const replaced = new Set(ms.map((x) => x.m.replacesMembershipId).filter(Boolean));
  const seats = ms.filter((x) => !replaced.has(x.m.id)).map((x) => {
    const c = contribs.find((c) => c.membershipId === x.m.id);
    let state: SeatState = "due";
    const open = x.m.status === "LEFT" && !collected.has(x.m.id);
    if (current && current.recipientMembershipId === x.m.id && current.status !== "SCHEDULED") state = "now";
    else if (c?.status === "PAID" || c?.status === "LATE") state = "paid";
    else if (c?.status === "FAILED") state = current?.status === "GRACE" ? "late" : "failed";
    else if (c?.status === "COVERED") state = "covered";
    else if (collected.has(x.m.id)) state = "paidout";
    if (open) state = "open";
    const turn = rounds.find((r) => r.recipientMembershipId === x.m.id);
    return { membershipId: x.m.id, memberId: x.memberId, name: open ? "Open seat" : x.name, initials: x.name.slice(0, 1), position: turn?.seq ?? x.m.position, score: x.score, level: levelFor(x.score), state, isMe: x.memberId === viewerId, status: x.m.status };
  });

  const recipient = current ? nameOfMembership.get(current.recipientMembershipId ?? "") ?? "" : "";
  const recentPayout = lastPaid ? payouts.find((p) => p.roundId === lastPaid.id) : null;
  const myTurn = me ? rounds.find((r) => r.recipientMembershipId === me.m.id) ?? null : null;

  // Shugaba's one current line: the most useful sentence for this viewer right now.
  let line = "";
  const unpaid = contribs.filter((c) => c.status === "FAILED");
  if (circle.status === "FORMING") line = `${ms.length} of ${circle.size} have joined. I'll start when everyone is in.`;
  else if (circle.status === "COMPLETED") line = "Every turn is paid. Well done, everyone.";
  else if (circle.status === "PAUSED") line = "I paused the circle while an operator checks a payment.";
  else if (current?.status === "GRACE" && unpaid.length) line = `${unpaid.map((u) => nameOfMembership.get(u.membershipId)).join(", ")} ${unpaid.length > 1 ? "are" : "is"} late. ${recipient} is paid in full either way.`;
  else if (current && current.status !== "SCHEDULED") line = `${contribs.filter((c) => c.status === "PAID" || c.status === "LATE").length} of ${circle.size} have paid in.`;
  else if (lastPaid && recentPayout) line = `${nameOfMembership.get(lastPaid.recipientMembershipId ?? "")} got ${formatCents(recentPayout.amount)}. Next: ${recipient}.`;
  else if (current) line = `First payments are due ${current.collectionDueAt.toDateString().slice(4, 10)}.`;

  return {
    circle: { id: circle.id, name: circle.name, status: circle.status, size: circle.size, frequency: circle.frequency, tier: circle.protectionTier, graceHours: circle.graceHours, inviteCode: me ? circle.inviteCode : null, isOrganiser: circle.createdBy === viewerId, contribution: circle.contributionAmount, fee: fee.fee, pot, poolBalance: circle.poolBalance, bonusHeld: circle.bonusHeldBalance },
    seats,
    me: me ? { membershipId: me.m.id, status: me.m.status, turnSeq: myTurn?.seq ?? null, turnDate: myTurn?.payoutDueAt.toISOString() ?? null, myContribution: contribs.find((c) => c.membershipId === me.m.id)?.status ?? null } : null,
    current: current ? { id: current.id, seq: current.seq, status: current.status, recipient, collectionDueAt: current.collectionDueAt.toISOString(), payoutDueAt: current.payoutDueAt.toISOString() } : null,
    rounds: rounds.map((r) => ({ seq: r.seq, status: r.status, recipient: nameOfMembership.get(r.recipientMembershipId ?? "") ?? "", recipientMembershipId: r.recipientMembershipId, collectionDueAt: r.collectionDueAt.toISOString(), payoutDueAt: r.payoutDueAt.toISOString(), payout: payouts.find((p) => p.roundId === r.id)?.amount ?? null })),
    line,
    now: at.toISOString(),
  };
}

export type CircleView = NonNullable<Awaited<ReturnType<typeof circleView>>>;

export async function myCircles(memberId: string) {
  return db()
    .select({ id: s.circles.id, name: s.circles.name, status: s.circles.status, contribution: s.circles.contributionAmount, size: s.circles.size })
    .from(s.memberships)
    .innerJoin(s.circles, eq(s.circles.id, s.memberships.circleId))
    .where(and(eq(s.memberships.memberId, memberId)))
    .orderBy(desc(s.circles.createdAt));
}

export async function isMember(circleId: string, memberId: string) {
  const [m] = await db().select({ id: s.memberships.id }).from(s.memberships).where(and(eq(s.memberships.circleId, circleId), eq(s.memberships.memberId, memberId)));
  return !!m;
}
