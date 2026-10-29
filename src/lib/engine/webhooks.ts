import { eq } from "drizzle-orm";
import { db as getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { fromPayPalValue, type ProviderEvent } from "@/lib/paypal";
import { confirmPayout, recordChargeResult } from "./rounds";
import { applyRecoveryPayment } from "./recovery";

/** Stores a verified event once. Returns false for a duplicate (spec 7.4: replay changes nothing). */
export async function storeWebhook(e: ProviderEvent, verified: boolean): Promise<boolean> {
  const rows = await getDb().insert(s.webhookEvents).values({ providerEventId: e.id, type: e.type, payload: e as unknown as Record<string, unknown>, verified }).onConflictDoNothing().returning({ id: s.webhookEvents.providerEventId });
  return rows.length > 0;
}

/** Worker side: apply one stored event idempotently. Out-of-order events are safe because every handler checks state. */
export async function processWebhook(eventId: string) {
  const db = getDb();
  const [row] = await db.select().from(s.webhookEvents).where(eq(s.webhookEvents.providerEventId, eventId));
  if (!row || row.processedAt || !row.verified) return;
  const e = row.payload as unknown as ProviderEvent;
  const r = e.resource as Record<string, unknown>;
  try {
    switch (e.type) {
      case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": {
        const payoutId = String((r.payout_item as { sender_item_id?: string } | undefined)?.sender_item_id ?? r.sender_item_id ?? "");
        if (payoutId) await confirmPayout(payoutId);
        break;
      }
      case "PAYMENT.CAPTURE.COMPLETED": {
        const custom = String(r.custom_id ?? "");
        if (custom.startsWith("catchup:")) await recordChargeResult(custom.slice(8), { paid: true, ref: String(r.id) });
        break;
      }
      case "INVOICING.INVOICE.PAID": {
        const inv = (r.invoice ?? r) as { id?: string; payments?: { paid_amount?: { value: string }; transactions?: { payment_id: string; amount: { value: string } }[] } };
        if (!inv.id) break;
        const [rec] = await db.select().from(s.recoveries).where(eq(s.recoveries.providerInvoiceId, inv.id));
        if (!rec) break;
        for (const t of inv.payments?.transactions ?? []) await applyRecoveryPayment(rec.id, fromPayPalValue(t.amount.value), t.payment_id);
        break;
      }
      default:
        break; // stored for reconciliation; nothing to apply
    }
    await db.update(s.webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(s.webhookEvents.providerEventId, eventId));
  } catch (err) {
    await db.update(s.webhookEvents).set({ error: String(err).slice(0, 500) }).where(eq(s.webhookEvents.providerEventId, eventId));
    throw err;
  }
}
