import { and, eq, inArray, sql } from "drizzle-orm";
import { db as getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";
import { getPaymentProvider } from "@/lib/paypal";
import { applyRecoveryPayment } from "./recovery";
import { recordChargeResult } from "./rounds";
import { EngineError } from "./types";

type Purpose = "catchup" | "recovery";

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * A member pays something they owe from chat (spec 10.7 "plan, then confirm"): a missed contribution
 * during grace, or part of a recovery after the pool covered them. Creates a buyer-approved PayPal
 * order and returns its approval link; the PayPal button is the confirm. Nothing moves until capture.
 */
export async function startMemberPayment(input: { memberId: string; circleId: string; purpose: Purpose; part?: "half" | "rest" | "full" }) {
  const db = getDb();
  const [ms] = await db.select().from(s.memberships).where(and(eq(s.memberships.circleId, input.circleId), eq(s.memberships.memberId, input.memberId)));
  if (!ms) throw new EngineError("FORBIDDEN", "not in this circle");
  let targetId: string;
  let amount: number;
  if (input.purpose === "catchup") {
    const [c] = await db.select().from(s.contributions).innerJoin(s.rounds, eq(s.rounds.id, s.contributions.roundId)).where(and(eq(s.contributions.membershipId, ms.id), eq(s.contributions.status, "FAILED"), eq(s.rounds.status, "GRACE")));
    if (!c) throw new EngineError("CONFLICT", "nothing to catch up");
    targetId = c.contributions.id;
    amount = c.contributions.amount + c.contributions.feeAmount;
  } else {
    const [r] = await db.select().from(s.recoveries).where(and(eq(s.recoveries.membershipId, ms.id), inArray(s.recoveries.status, ["OPEN", "PARTIAL"])));
    if (!r) throw new EngineError("CONFLICT", "nothing owed");
    targetId = r.id;
    const left = r.amountDue - r.amountPaid;
    amount = input.part === "half" && r.amountPaid === 0 ? Math.ceil(r.amountDue / 2) : left;
  }
  const customId = `${input.purpose}:${targetId}`;
  const order = await getPaymentProvider().createOrder({
    amount,
    currency: "USD",
    customId,
    idempotencyKey: `${input.purpose}-${targetId}-${amount}`,
    description: input.purpose === "catchup" ? "Circle contribution (catch-up)" : "Paying back the protection pool",
    returnUrl: `${site()}/paypal/order-return`,
    cancelUrl: `${site()}/c/${input.circleId}/chat`,
  });
  await db.insert(s.proposals).values({ id: uuidv7(), circleId: input.circleId, memberId: input.memberId, kind: input.purpose === "catchup" ? "CATCH_UP_ORDER" : "PAYMENT_PLAN", payloadJson: { orderId: order.orderId, purpose: input.purpose, targetId, amount } });
  return { approvalUrl: order.approvalUrl, amount };
}

/** PayPal sent the member back after approving: capture the order and apply it. Idempotent by capture id. */
export async function completeMemberPayment(orderId: string, memberId: string) {
  const db = getDb();
  const [p] = await db.select().from(s.proposals).where(and(eq(s.proposals.memberId, memberId), sql`${s.proposals.payloadJson}->>'orderId' = ${orderId}`));
  if (!p) throw new EngineError("NOT_FOUND", "payment not found");
  const pay = p.payloadJson as { purpose: Purpose; targetId: string; amount: number };
  if (p.status === "CONFIRMED") return { circleId: p.circleId!, ok: true, already: true };
  const cap = await getPaymentProvider().captureOrder(orderId, `capture-${orderId}`);
  if (cap.status !== "COMPLETED" || !cap.providerRef) {
    await db.update(s.proposals).set({ status: "DECLINED", updatedAt: new Date() }).where(eq(s.proposals.id, p.id));
    return { circleId: p.circleId!, ok: false, already: false, reason: "reason" in cap ? cap.reason : "not completed" };
  }
  if (pay.purpose === "catchup") await recordChargeResult(pay.targetId, { paid: true, ref: cap.providerRef });
  else await applyRecoveryPayment(pay.targetId, pay.amount, cap.providerRef);
  await db.update(s.proposals).set({ status: "CONFIRMED", updatedAt: new Date() }).where(eq(s.proposals.id, p.id));
  return { circleId: p.circleId!, ok: true, already: false };
}
