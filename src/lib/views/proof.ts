import { desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

/**
 * Public proof that money moved through the PayPal sandbox (route /proof). Only references PayPal itself issued are
 * listed: the mock provider's ids (CAP-…, BATCH-…, INV2-<hex>) and seeded history are filtered out by their shape.
 * Names show as initials, like the public ledger.
 */
const REAL = {
  capture: /^[0-9A-Z]{17}$/, // PayPal capture id
  batch: /^[0-9A-Z]{13}$/, // PayPal Payouts batch id
  invoice: /^INV2(-[0-9A-Z]{4}){4}$/, // PayPal Invoicing v2 id
};

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? "").join("");

export type ProofRow = { kind: "charge" | "payout" | "invoice"; ref: string; amount: number; who: string; circle: string; round: number | null; at: Date; status: string };

export async function proofView() {
  const d = db();
  const charges = await d
    .select({ ref: s.contributions.providerRef, amount: s.contributions.amount, fee: s.contributions.feeAmount, status: s.contributions.status, at: s.contributions.updatedAt, name: s.members.name, circle: s.circles.name, round: s.rounds.seq })
    .from(s.contributions)
    .innerJoin(s.rounds, eq(s.rounds.id, s.contributions.roundId))
    .innerJoin(s.circles, eq(s.circles.id, s.rounds.circleId))
    .innerJoin(s.memberships, eq(s.memberships.id, s.contributions.membershipId))
    .innerJoin(s.members, eq(s.members.id, s.memberships.memberId))
    .where(isNotNull(s.contributions.providerRef))
    .orderBy(desc(s.contributions.updatedAt))
    .limit(400);
  const payouts = await d
    .select({ ref: s.payouts.providerBatchId, amount: s.payouts.amount, status: s.payouts.status, at: s.payouts.updatedAt, name: s.members.name, circle: s.circles.name, round: s.rounds.seq })
    .from(s.payouts)
    .innerJoin(s.rounds, eq(s.rounds.id, s.payouts.roundId))
    .innerJoin(s.circles, eq(s.circles.id, s.rounds.circleId))
    .innerJoin(s.memberships, eq(s.memberships.id, s.rounds.recipientMembershipId))
    .innerJoin(s.members, eq(s.members.id, s.memberships.memberId))
    .where(isNotNull(s.payouts.providerBatchId))
    .orderBy(desc(s.payouts.updatedAt))
    .limit(200);
  const invoices = await d
    .select({ ref: s.recoveries.providerInvoiceId, amount: s.recoveries.amountDue, paid: s.recoveries.amountPaid, status: s.recoveries.status, at: s.recoveries.updatedAt, name: s.members.name, circle: s.circles.name })
    .from(s.recoveries)
    .innerJoin(s.memberships, eq(s.memberships.id, s.recoveries.membershipId))
    .innerJoin(s.members, eq(s.members.id, s.memberships.memberId))
    .innerJoin(s.circles, eq(s.circles.id, s.memberships.circleId))
    .where(isNotNull(s.recoveries.providerInvoiceId))
    .orderBy(desc(s.recoveries.updatedAt))
    .limit(100);
  const hooks = await d.select({ type: s.webhookEvents.type, verified: s.webhookEvents.verified, at: s.webhookEvents.createdAt }).from(s.webhookEvents).orderBy(desc(s.webhookEvents.createdAt)).limit(2000);

  const rows: ProofRow[] = [
    ...charges.filter((c) => REAL.capture.test(c.ref ?? "")).map((c) => ({ kind: "charge" as const, ref: c.ref!, amount: c.amount + c.fee, who: initials(c.name), circle: c.circle, round: c.round, at: c.at, status: c.status })),
    ...payouts.filter((p) => REAL.batch.test(p.ref ?? "")).map((p) => ({ kind: "payout" as const, ref: p.ref!, amount: p.amount, who: initials(p.name), circle: p.circle, round: p.round, at: p.at, status: p.status })),
    ...invoices.filter((i) => REAL.invoice.test(i.ref ?? "")).map((i) => ({ kind: "invoice" as const, ref: i.ref!, amount: i.amount, who: initials(i.name), circle: i.circle, round: null, at: i.at, status: i.status })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const verified = hooks.filter((h) => h.verified);
  const byType = new Map<string, number>();
  for (const h of verified) byType.set(h.type, (byType.get(h.type) ?? 0) + 1);

  return {
    sandbox: process.env.PAYMENT_PROVIDER === "paypal",
    counts: {
      charges: rows.filter((r) => r.kind === "charge").length,
      payouts: rows.filter((r) => r.kind === "payout" && r.status === "SUCCEEDED").length,
      invoices: rows.filter((r) => r.kind === "invoice").length,
      webhooks: verified.length,
      moved: rows.filter((r) => r.kind !== "invoice").reduce((t, r) => t + r.amount, 0),
    },
    webhookTypes: [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    lastWebhookAt: verified[0]?.at ?? null,
    rows: rows.slice(0, 40),
  };
}
