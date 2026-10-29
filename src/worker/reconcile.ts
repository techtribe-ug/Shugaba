import { and, gte, isNotNull } from "drizzle-orm";
import { db as getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getPaymentProvider } from "@/lib/paypal";

/**
 * Nightly: compare PayPal's transaction list with our ledger. Reporting data lags, so only items older
 * than a day are expected to match. Mismatches are logged for the control tower.
 */
export async function reconcile(windowDays = 3) {
  const end = new Date(Date.now() - 86_400_000);
  const start = new Date(end.getTime() - windowDays * 86_400_000);
  const txns = await getPaymentProvider().listTransactions({ start, end });
  const ours = await getDb().select({ ref: s.contributions.providerRef }).from(s.contributions).where(and(isNotNull(s.contributions.providerRef), gte(s.contributions.updatedAt, start)));
  const known = new Set(txns.map((t) => t.id));
  const missing = ours.filter((o) => o.ref && !known.has(o.ref)).map((o) => o.ref);
  if (missing.length) console.warn(`[reconcile] ${missing.length} captures not yet in PayPal reporting`);
  return { checked: ours.length, paypal: txns.length, missing };
}
