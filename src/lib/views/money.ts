import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { protectionFee } from "@/lib/treasury";

export type MoneyRow = {
  kind: "contribution" | "payout" | "recovery";
  title: string;
  detail: string;
  amount: number;
  sign: "in" | "out" | "none";
  status: "paid" | "late" | "failed" | "covered" | "recovered" | "received" | "sending" | "open" | "partial";
  ref: string | null;
  at: Date;
  href?: string;
};

export type DueCard =
  | { kind: "catchup"; amount: number; until: Date; round: number }
  | { kind: "recovery"; due: number; paid: number; invoice: string | null }
  | { kind: "next"; amount: number; contribution: number; fee: number; on: Date; round: number; paidEarly: boolean; autopay: boolean }
  | { kind: "done" }
  | { kind: "forming" };

/** Everything one member paid in, received and owes in one circle (route /c/[id]/money). Their own data only. */
export async function moneyView(circleId: string, memberId: string) {
  const d = db();
  const [ms] = await d.select().from(s.memberships).where(and(eq(s.memberships.circleId, circleId), eq(s.memberships.memberId, memberId)));
  if (!ms) return null;
  const [circle] = await d.select().from(s.circles).where(eq(s.circles.id, circleId));
  if (!circle) return null;
  const [mandate] = await d.select().from(s.collectionMandates).where(eq(s.collectionMandates.membershipId, ms.id));
  const rounds = await d.select().from(s.rounds).where(eq(s.rounds.circleId, circleId)).orderBy(asc(s.rounds.seq));
  const seqOf = new Map(rounds.map((r) => [r.id, r]));
  const mine = await d.select().from(s.contributions).where(eq(s.contributions.membershipId, ms.id));
  const myRounds = rounds.filter((r) => r.recipientMembershipId === ms.id);
  const payouts = myRounds.length ? await d.select().from(s.payouts).where(inArray(s.payouts.roundId, myRounds.map((r) => r.id))) : [];
  const recoveries = await d.select().from(s.recoveries).where(eq(s.recoveries.membershipId, ms.id));
  const fee = protectionFee(circle.contributionAmount, circle.protectionTier).fee;

  // What needs doing, most urgent first.
  const graceRound = rounds.find((r) => r.status === "GRACE");
  const failedNow = graceRound ? mine.find((c) => c.roundId === graceRound.id && c.status === "FAILED") : undefined;
  const openRecovery = recoveries.find((r) => r.status === "OPEN" || r.status === "PARTIAL");
  const nextRound = rounds.find((r) => r.status === "SCHEDULED");
  let due: DueCard;
  if (circle.status === "FORMING") due = { kind: "forming" };
  else if (failedNow && graceRound) due = { kind: "catchup", amount: failedNow.amount + failedNow.feeAmount, until: graceRound.graceEndsAt, round: graceRound.seq };
  else if (openRecovery) due = { kind: "recovery", due: openRecovery.amountDue, paid: openRecovery.amountPaid, invoice: openRecovery.providerInvoiceId };
  else if (nextRound) {
    const c = mine.find((x) => x.roundId === nextRound.id);
    due = { kind: "next", amount: circle.contributionAmount + fee, contribution: circle.contributionAmount, fee, on: nextRound.collectionDueAt, round: nextRound.seq, paidEarly: !!c && c.status !== "SCHEDULED", autopay: mandate?.status === "ACTIVE" };
  } else due = { kind: "done" };

  // My turn.
  const turnRound = myRounds[myRounds.length - 1] ?? null;
  const turnPayout = turnRound ? payouts.find((p) => p.roundId === turnRound.id) : undefined;
  const turn = turnRound
    ? { round: turnRound.seq, on: turnRound.payoutDueAt, amount: turnPayout?.amount ?? circle.contributionAmount * circle.size, status: turnPayout?.status === "SUCCEEDED" ? ("received" as const) : turnPayout ? ("sending" as const) : ("upcoming" as const), roundId: turnRound.id }
    : null;

  // History.
  const rows: MoneyRow[] = [];
  for (const c of mine) {
    const r = seqOf.get(c.roundId);
    if (!r || c.status === "SCHEDULED") continue;
    const status = ({ PAID: "paid", LATE: "late", FAILED: "failed", COVERED: "covered", RECOVERED: "recovered" } as const)[c.status as "PAID" | "LATE" | "FAILED" | "COVERED" | "RECOVERED"];
    const label = { paid: "Paid", late: "Paid in grace", failed: "Didn't go through", covered: "Covered by the pool", recovered: "Paid back" }[status];
    rows.push({ kind: "contribution", title: `Round ${r.seq} contribution`, detail: label, amount: c.amount + c.feeAmount, sign: status === "failed" || status === "covered" ? "none" : "out", status, ref: c.providerRef, at: c.updatedAt });
  }
  for (const p of payouts) {
    const r = seqOf.get(p.roundId);
    rows.push({ kind: "payout", title: `Your payout${r ? `, round ${r.seq}` : ""}`, detail: p.status === "SUCCEEDED" ? "In your PayPal" : p.status === "FAILED" ? "PayPal refused it; Shugaba is retrying" : "On its way", amount: p.amount, sign: "in", status: p.status === "SUCCEEDED" ? "received" : "sending", ref: p.providerBatchId, at: p.updatedAt, href: `/c/${circleId}/payout/${p.roundId}` });
  }
  for (const r of recoveries) {
    const left = r.amountDue - r.amountPaid;
    rows.push({ kind: "recovery", title: "Paying back the pool", detail: left > 0 ? `${r.amountPaid ? "Part paid. " : ""}PayPal invoice` : "All paid back", amount: r.amountDue, sign: "none", status: left <= 0 ? "recovered" : r.amountPaid ? "partial" : "open", ref: r.providerInvoiceId, at: r.updatedAt });
  }
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());

  const paidIn = mine.filter((c) => c.status === "PAID" || c.status === "LATE" || c.status === "RECOVERED").reduce((t, c) => t + c.amount + c.feeAmount, 0);
  const fees = mine.filter((c) => c.status === "PAID" || c.status === "LATE" || c.status === "RECOVERED").reduce((t, c) => t + c.feeAmount, 0);
  const received = payouts.filter((p) => p.status === "SUCCEEDED").reduce((t, p) => t + p.amount, 0);
  const owed = recoveries.reduce((t, r) => t + Math.max(0, r.amountDue - r.amountPaid), 0);

  return { circle: { id: circle.id, name: circle.name, status: circle.status }, due, turn, totals: { paidIn, fees, received, owed }, rows, autopay: mandate?.status === "ACTIVE" };
}
