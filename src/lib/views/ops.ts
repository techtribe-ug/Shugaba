import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { now } from "@/lib/engine/clock";

const DAY = 86_400_000;

/** Probability a member misses one payment, from their score (risk engine: code decides, spec 10.2). */
export function missProbability(score: number): number {
  return Math.min(0.45, Math.max(0.01, 0.03 + (700 - score) / 900));
}

/** v_circle_health: pool coverage in missed payments, open issues, next date. */
export async function circleHealth() {
  const d = db();
  const circles = await d.select().from(s.circles).orderBy(s.circles.name);
  const flags = await d.select({ circleId: s.fraudFlags.circleId, n: sql<number>`count(*)::int` }).from(s.fraudFlags).where(eq(s.fraudFlags.status, "OPEN")).groupBy(s.fraudFlags.circleId);
  const recs = await d.select({ circleId: s.memberships.circleId, n: sql<number>`count(*)::int`, owed: sql<number>`coalesce(sum(${s.recoveries.amountDue} - ${s.recoveries.amountPaid}), 0)::int` }).from(s.recoveries).innerJoin(s.memberships, eq(s.memberships.id, s.recoveries.membershipId)).where(inArray(s.recoveries.status, ["OPEN", "PARTIAL"])).groupBy(s.memberships.circleId);
  return circles.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    tier: c.protectionTier,
    size: c.size,
    contribution: c.contributionAmount,
    pool: c.poolBalance,
    reserveOwed: c.reserveOwed,
    // How many missed payments the circle's own pool can cover right now.
    coverage: c.contributionAmount ? c.poolBalance / c.contributionAmount : 0,
    openFlags: flags.find((f) => f.circleId === c.id)?.n ?? 0,
    openRecoveries: recs.find((r) => r.circleId === c.id)?.n ?? 0,
    owed: recs.find((r) => r.circleId === c.id)?.owed ?? 0,
  }));
}

/** Circles × upcoming rounds, coloured by the chance at least one member misses. */
export async function riskHeatmap() {
  const d = db();
  const circles = await d.select().from(s.circles).where(inArray(s.circles.status, ["ACTIVE", "PAUSED"]));
  const out = [];
  for (const c of circles) {
    const ms = await d.select({ id: s.memberships.id, score: s.members.circleScore }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, c.id));
    const rounds = await d.select().from(s.rounds).where(and(eq(s.rounds.circleId, c.id), inArray(s.rounds.status, ["SCHEDULED", "COLLECTING", "GRACE", "HELD"]))).orderBy(s.rounds.seq).limit(6);
    // A member who already collected is likelier to miss later turns (spec 9: the early-taker risk).
    const paidOut = new Set((await d.select({ r: s.rounds.recipientMembershipId }).from(s.rounds).where(and(eq(s.rounds.circleId, c.id), eq(s.rounds.status, "PAID_OUT")))).map((x) => x.r));
    out.push({
      circle: c.name,
      cells: rounds.map((r) => {
        const pAll = ms.reduce((acc, m) => acc * (1 - missProbability(m.score) * (paidOut.has(m.id) ? 1.5 : 1)), 1);
        return { seq: r.seq, p: 1 - pAll, held: r.status === "HELD" };
      }),
    });
  }
  return out;
}

/** Cash-flow waterfall across all circles: contributions → fees → covers → recoveries → payouts. */
export async function cashFlow() {
  const d = db();
  const rows = await d.select({ type: s.ledgerEvents.type, payload: s.ledgerEvents.payloadJson }).from(s.ledgerEvents).where(inArray(s.ledgerEvents.type, ["CONTRIBUTION_PAID", "POOL_COVER", "RESERVE_COVER", "RECOVERY_PAYMENT", "PAYOUT_SENT"]));
  const sum = (types: string[], key: string) => rows.filter((r) => types.includes(r.type)).reduce((a, r) => a + Number((r.payload as Record<string, unknown>)[key] ?? 0), 0);
  return [
    { label: "Contributions", value: sum(["CONTRIBUTION_PAID"], "amount") },
    { label: "Fees to pool", value: sum(["CONTRIBUTION_PAID"], "fee") },
    { label: "Covers", value: -sum(["POOL_COVER", "RESERVE_COVER"], "amount") },
    { label: "Recoveries", value: sum(["RECOVERY_PAYMENT"], "amount") },
    { label: "Payouts", value: -sum(["PAYOUT_SENT"], "amount") },
  ];
}

/** v_recoveries: every recovery with member, circle, progress and days overdue. */
export async function recoveriesView() {
  const d = db();
  const at = await now(d);
  const rows = await d.select({ r: s.recoveries, member: s.members.name, circle: s.circles.name, circleId: s.circles.id }).from(s.recoveries).innerJoin(s.memberships, eq(s.memberships.id, s.recoveries.membershipId)).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).innerJoin(s.circles, eq(s.circles.id, s.memberships.circleId)).orderBy(desc(s.recoveries.createdAt));
  return rows.map((x) => ({ id: x.r.id, member: x.member, circle: x.circle, circleId: x.circleId, due: x.r.amountDue, paid: x.r.amountPaid, status: x.r.status, invoice: !!x.r.providerInvoiceId, daysOpen: x.r.status === "PAID" ? 0 : Math.max(0, Math.floor((at.getTime() - x.r.createdAt.getTime()) / DAY)) }));
}

/** v_defaults_by_member: members with misses, across circles. */
export async function defaultsByMember() {
  const d = db();
  const rows = await d
    .select({ member: s.members.name, score: s.members.circleScore, circles: sql<number>`count(distinct ${s.memberships.circleId})::int`, misses: sql<number>`count(*)::int` })
    .from(s.contributions)
    .innerJoin(s.memberships, eq(s.memberships.id, s.contributions.membershipId))
    .innerJoin(s.members, eq(s.members.id, s.memberships.memberId))
    .where(inArray(s.contributions.status, ["FAILED", "COVERED", "RECOVERED"]))
    .groupBy(s.members.name, s.members.circleScore)
    .orderBy(desc(sql`count(*)`));
  return rows;
}

export async function openFlags() {
  const d = db();
  const rows = await d.select({ f: s.fraudFlags, circle: s.circles.name, member: s.members.name }).from(s.fraudFlags).innerJoin(s.circles, eq(s.circles.id, s.fraudFlags.circleId)).leftJoin(s.members, eq(s.members.id, s.fraudFlags.memberId)).orderBy(desc(s.fraudFlags.createdAt));
  return rows.map((x) => ({ id: x.f.id, rule: x.f.rule, status: x.f.status, circle: x.circle, circleId: x.f.circleId, member: x.member, detail: x.f.detailJson as Record<string, unknown>, at: x.f.createdAt.toISOString() }));
}

export async function latestTraces(limit = 20) {
  const rows = await db().select().from(s.agentTraces).orderBy(desc(s.agentTraces.createdAt)).limit(limit);
  return rows.map((t) => ({ id: t.id, agent: t.agent, model: t.model, promptVersion: t.promptVersion, latencyMs: t.latencyMs, tokens: (t.tokensIn ?? 0) + (t.tokensOut ?? 0), error: t.error, at: t.createdAt.toISOString() }));
}

export async function scoreDistribution() {
  const rows = await db().select({ score: s.members.circleScore }).from(s.members).where(eq(s.members.isOperator, false));
  const bands = [
    { title: "Newcomer", min: 300, max: 549 },
    { title: "Steady", min: 550, max: 679 },
    { title: "Trusted", min: 680, max: 779 },
    { title: "Pillar", min: 780, max: 850 },
  ];
  return bands.map((b) => ({ ...b, n: rows.filter((r) => r.score >= b.min && r.score <= b.max).length }));
}

/** Top numbers for "Today": payouts paid in full, reserve, recoveries in progress. */
export async function todayStats() {
  const d = db();
  const [p] = await d.select({ all: sql<number>`count(*)::int`, full: sql<number>`count(*) filter (where ${s.payouts.status} = 'SUCCEEDED')::int` }).from(s.payouts);
  const [r] = await d.select({ balance: s.globalReserve.balance }).from(s.globalReserve).where(eq(s.globalReserve.id, 1));
  const [rec] = await d.select({ n: sql<number>`count(*)::int` }).from(s.recoveries).where(inArray(s.recoveries.status, ["OPEN", "PARTIAL"]));
  return { payouts: p?.all ?? 0, paidInFull: p?.full ?? 0, reserve: r?.balance ?? 0, recovering: rec?.n ?? 0, now: (await now(d)).toISOString() };
}

/** Payouts waiting on an operator: rounds HELD, with the flag (if any) that holds them. */
export async function heldPayouts() {
  const d = db();
  const rows = await d.select({ round: s.rounds, circle: s.circles, member: s.members.name }).from(s.rounds).innerJoin(s.circles, eq(s.circles.id, s.rounds.circleId)).innerJoin(s.memberships, eq(s.memberships.id, s.rounds.recipientMembershipId)).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.rounds.status, "HELD"));
  const flags = await d.select().from(s.fraudFlags).where(and(eq(s.fraudFlags.rule, "METHOD_CHANGED_BEFORE_PAYOUT"), eq(s.fraudFlags.status, "OPEN")));
  return rows.map((x) => {
    const flag = flags.find((f) => (f.detailJson as { roundId?: string }).roundId === x.round.id);
    const changedAt = flag ? new Date(String((flag.detailJson as { changedAt?: string }).changedAt)) : null;
    const hours = changedAt ? Math.max(1, Math.round((x.round.payoutDueAt.getTime() - changedAt.getTime()) / 3_600_000)) : null;
    return { roundId: x.round.id, circleId: x.circle.id, circle: x.circle.name, member: x.member, amount: x.circle.contributionAmount * x.circle.size, flagId: flag?.id ?? null, why: flag ? `${x.member}'s PayPal account changed ${hours ? `${hours} h ` : ""}before payout.` : "The pool and reserve could not cover this round." };
  });
}

/** "Shugaba today": the latest decisions across circles, each with the rule behind it. */
export async function activityLog(limit = 12) {
  const d = db();
  const RULE: Record<string, string> = { POOL_COVER: "Rule 3", RESERVE_COVER: "Rule 3", RECOVERY_OPENED: "Rule 3", CIRCLE_PAUSED: "Fraud rule 2", TRADE_CONFIRMED: "Rule 2", PAYOUT_SENT: "Rule 4", OPERATOR_ACTION: "Operator", GRACE_STARTED: "Rule 3", TIER_RAISED: "Protection" };
  const rows = await d.select({ e: s.ledgerEvents, circle: s.circles.name }).from(s.ledgerEvents).innerJoin(s.circles, eq(s.circles.id, s.ledgerEvents.circleId)).where(inArray(s.ledgerEvents.type, Object.keys(RULE))).orderBy(desc(s.ledgerEvents.seq)).limit(limit);
  const ids = [...new Set(rows.flatMap((r) => Object.values(r.e.payloadJson as Record<string, unknown>).filter((v): v is string => typeof v === "string")))];
  const names = ids.length ? await d.select({ id: s.memberships.id, name: s.members.name }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(inArray(s.memberships.id, ids)) : [];
  const nameOf = (id: unknown) => names.find((n) => n.id === id)?.name ?? "a member";
  const usd = (c: unknown) => `$${(Number(c) / 100).toFixed(0)}`;
  return rows.map(({ e, circle }) => {
    const p = e.payloadJson as Record<string, unknown>;
    const text: Record<string, string> = {
      POOL_COVER: `Covered ${nameOf(p.membershipId)}'s ${usd(p.amount)} from the pool`,
      RESERVE_COVER: `Covered ${nameOf(p.membershipId)}'s ${usd(p.amount)} from the reserve`,
      RECOVERY_OPENED: `Sent ${nameOf(p.membershipId)} a ${usd(p.amountDue)} invoice`,
      CIRCLE_PAUSED: `Paused: ${String(p.reason)}`,
      TRADE_CONFIRMED: `Swapped turns ${String(p.toSeq)} and ${String(p.fromSeq)}`,
      PAYOUT_SENT: `Paid ${nameOf(p.recipientMembershipId)} ${usd(p.amount)}`,
      OPERATOR_ACTION: `Operator ${String(p.action)}: ${String(p.reason)}`,
      GRACE_STARTED: `Grace started for ${Array.isArray(p.unpaid) ? p.unpaid.map(nameOf).join(", ") : "late members"}`,
      TIER_RAISED: `Raised protection to ${String(p.to).toLowerCase()}`,
    };
    return { id: e.seq, circle, text: text[e.type] ?? e.type, rule: RULE[e.type] ?? "", at: e.createdAt.toISOString() };
  });
}
