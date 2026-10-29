import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { LEVELS, levelFor } from "@/lib/protocol";

const LABEL: Record<string, string> = {
  ON_TIME: "Paid on time",
  PAID_IN_GRACE: "Paid in the grace window",
  MISSED: "Missed a payment",
  RECOVERED: "Paid it back",
  WRITTEN_OFF: "Debt written off",
  CYCLE_COMPLETED: "Finished a full circle",
  CYCLE_COMPLETED_AFTER_EARLY: "Finished a circle after an early turn",
  TENURE_MONTH: "A month with Shugaba",
  LEFT_SHORT_NOTICE: "Left a circle at short notice",
};

/** What Pebble says next: points to the next level and the most useful way there. */
function nextStep(score: number) {
  const lvl = levelFor(score);
  const next = LEVELS[LEVELS.indexOf(lvl) + 1];
  if (!next) return `You're a Pillar. Keep paying on time and you stay one.`;
  return `${next.min - score} more and I'll call you ${next.title}. Paying on time is the quickest way there.`;
}

/** The signed-in member's own score and history (design: GMyScore). */
export async function myScoreView(memberId: string) {
  const d = db();
  const [m] = await d.select({ name: s.members.name, score: s.members.circleScore }).from(s.members).where(eq(s.members.id, memberId));
  if (!m) return null;
  const events = await d.select().from(s.scoreEvents).where(eq(s.scoreEvents.memberId, memberId)).orderBy(desc(s.scoreEvents.createdAt)).limit(30);
  return {
    name: m.name,
    score: m.score,
    level: levelFor(m.score),
    line: nextStep(m.score),
    events: events.map((e) => ({ id: e.id, delta: e.delta, label: LABEL[e.type] ?? e.reason, at: e.createdAt.toISOString() })),
  };
}

/** Another member as their circle sees them (design: GMember). Only facts the circle already shares. */
export async function memberProfile(circleId: string, memberId: string) {
  const d = db();
  const [row] = await d.select({ m: s.members, ms: s.memberships }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(and(eq(s.memberships.circleId, circleId), eq(s.memberships.memberId, memberId)));
  if (!row) return null;
  const [turn] = await d.select().from(s.rounds).where(and(eq(s.rounds.circleId, circleId), eq(s.rounds.recipientMembershipId, row.ms.id)));
  const allMs = await d.select({ id: s.memberships.id, circleId: s.memberships.circleId }).from(s.memberships).where(eq(s.memberships.memberId, memberId));
  const contribs = allMs.length ? await d.select({ status: s.contributions.status }).from(s.contributions).where(inArray(s.contributions.membershipId, allMs.map((x) => x.id))) : [];
  const settled = contribs.filter((c) => c.status !== "SCHEDULED");
  const onTime = settled.filter((c) => c.status === "PAID").length;
  const finished = allMs.length ? (await d.select({ id: s.circles.id }).from(s.circles).where(and(inArray(s.circles.id, allMs.map((x) => x.circleId)), eq(s.circles.status, "COMPLETED")))).length : 0;
  const missed = settled.filter((c) => c.status === "FAILED" || c.status === "COVERED" || c.status === "RECOVERED").length;
  const day = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const [circle] = await d.select({ status: s.circles.status }).from(s.circles).where(eq(s.circles.id, circleId));
  return {
    canSwap: circle?.status === "ACTIVE" && turn?.status === "SCHEDULED",
    name: row.m.name,
    score: row.m.circleScore,
    level: levelFor(row.m.circleScore),
    facts: [
      ["Turn", turn ? `${day(turn.payoutDueAt)} · ${turn.status === "PAID_OUT" ? "paid out" : "waiting"}` : "not set"],
      ["On time", `${onTime} of ${settled.length}`],
      ["Member since", row.m.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })],
      ["Circles finished", String(finished)],
    ] as [string, string][],
    // The group only sees "covered by the pool", never the details (spec 10.2).
    line: settled.length === 0 ? `${row.m.name} hasn't paid a round yet.` : missed === 0 ? `${row.m.name} has never missed a payment.` : `${row.m.name} was covered by the pool ${missed === 1 ? "once" : `${missed} times`}.`,
  };
}
