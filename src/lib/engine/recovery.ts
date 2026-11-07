import { and, eq, sql } from "drizzle-orm";
import { db as getDb } from "@/lib/db/client";
import { appendLedger } from "@/lib/db/ledger";
import * as s from "@/lib/db/schema";
import { getPaymentProvider } from "@/lib/paypal";
import { publish } from "@/lib/realtime/bus";
import { recoveryStatusAfter, splitRecoveryPayment } from "@/lib/treasury";
import { now } from "./clock";
import { poolMove } from "./pool";
import { changeScore } from "./score";
import { EngineError } from "./types";

/** Default plan the recovery agent offers: two equal parts, a week apart. Terms stay within circle rules. */
export function defaultPlan(amountDue: number, at: Date) {
  const first = Math.ceil(amountDue / 2);
  return {
    parts: [
      { amount: first, dueAt: new Date(at.getTime() + 7 * 86_400_000).toISOString() },
      { amount: amountDue - first, dueAt: new Date(at.getTime() + 14 * 86_400_000).toISOString() },
    ],
  };
}

/** Sends the PayPal invoice for a covered payment. Idempotent per recovery. */
export async function sendRecoveryInvoice(recoveryId: string) {
  const db = getDb();
  const [row] = await db
    .select({ r: s.recoveries, member: s.members, circle: s.circles })
    .from(s.recoveries)
    .innerJoin(s.memberships, eq(s.memberships.id, s.recoveries.membershipId))
    .innerJoin(s.members, eq(s.members.id, s.memberships.memberId))
    .innerJoin(s.circles, eq(s.circles.id, s.memberships.circleId))
    .where(eq(s.recoveries.id, recoveryId));
  if (!row) throw new EngineError("NOT_FOUND", "recovery not found");
  if (row.r.providerInvoiceId) return row.r;
  const at = await now(db);
  const plan = defaultPlan(row.r.amountDue, at);
  const inv = await getPaymentProvider().createAndSendInvoice({
    recipientEmail: row.member.paypalEmail ?? row.member.email,
    recipientName: row.member.name,
    amount: row.r.amountDue - row.r.amountPaid,
    currency: "USD",
    invoiceRef: `SHG-${recoveryId.slice(0, 18)}`,
    note: `${row.circle.name}: the Protection Pool covered your payment. You can pay in two parts.`,
    dueInDays: 14,
  });
  const [updated] = await db.update(s.recoveries).set({ providerInvoiceId: inv.invoiceId, planJson: { ...plan, payUrl: inv.payUrl }, updatedAt: new Date() }).where(eq(s.recoveries.id, recoveryId)).returning();
  return updated!;
}

/**
 * A recovery payment (invoice paid, or a plan part). Repays the reserve first, then the circle pool.
 * `ref` makes it idempotent: the same PayPal capture id is applied once.
 */
export async function applyRecoveryPayment(recoveryId: string, amount: number, ref: string) {
  const db = getDb();
  const circleId = await db.transaction(async (tx) => {
    const [r] = await tx.select().from(s.recoveries).where(eq(s.recoveries.id, recoveryId)).for("update");
    if (!r) throw new EngineError("NOT_FOUND", "recovery not found");
    const [m] = await tx.select().from(s.memberships).where(eq(s.memberships.id, r.membershipId));
    const [c] = await tx.select().from(s.circles).where(eq(s.circles.id, m!.circleId)).for("update");
    const dup = await tx.select({ id: s.poolLedger.id }).from(s.poolLedger).where(and(eq(s.poolLedger.ref, `recovery:${ref}`)));
    if (dup.length) return c!.id;
    const remaining = r.amountDue - r.amountPaid;
    if (remaining <= 0) return c!.id;
    const pay = Math.min(amount, remaining);
    if (pay <= 0) throw new EngineError("INVALID", "payment must be positive");
    const at = await now(tx);
    const split = splitRecoveryPayment(pay, c!.reserveOwed);
    await appendLedger(tx, c!.id, { type: "RECOVERY_PAYMENT", recoveryId, amount: pay, toReserve: split.toReserve, toPool: split.toPool }, "worker", at);
    if (split.toReserve > 0) {
      await poolMove(tx, "reserve", "RESERVE_REPAY", split.toReserve, `recovery:${ref}`);
      await tx.update(s.circles).set({ reserveOwed: sql`${s.circles.reserveOwed} - ${split.toReserve}` }).where(eq(s.circles.id, c!.id));
    }
    if (split.toPool > 0) await poolMove(tx, { circleId: c!.id, bucket: "free" }, "RECOVERY_IN", split.toPool, `recovery:${ref}`);
    const paid = r.amountPaid + pay;
    const status = recoveryStatusAfter(r.amountDue, paid);
    await tx.update(s.recoveries).set({ amountPaid: paid, status, updatedAt: new Date() }).where(eq(s.recoveries.id, recoveryId));
    if (status === "PAID") {
      await tx.update(s.contributions).set({ status: "RECOVERED", updatedAt: new Date() }).where(and(eq(s.contributions.roundId, r.roundId), eq(s.contributions.membershipId, r.membershipId)));
      await changeScore(tx, m!.memberId, c!.id, "RECOVERED", at);
    }
    return c!.id;
  });
  await publish(circleId, "pool.updated");
  await publish(circleId, "score.updated");
}

/** Catch-up during grace: a buyer-approved PayPal order for the missed contribution. */
export async function createCatchUpOrder(contributionId: string, returnUrl: string) {
  const db = getDb();
  const [c] = await db.select().from(s.contributions).where(eq(s.contributions.id, contributionId));
  if (!c || c.status !== "FAILED") throw new EngineError("CONFLICT", "nothing to catch up");
  return getPaymentProvider().createOrder({ amount: c.amount + c.feeAmount, currency: "USD", customId: `catchup:${c.id}`, idempotencyKey: `catchup-${c.id}`, description: "Circle contribution (catch-up)", returnUrl, cancelUrl: returnUrl });
}
