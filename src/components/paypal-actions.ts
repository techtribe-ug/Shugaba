"use server";

import { revalidatePath } from "next/cache";
import { getPaymentProvider, paypalStatus, recordPayPalOk } from "@/lib/paypal";

/** "Try now" on the PayPal-down notice: one cheap authenticated call; if PayPal answers, the notice clears. */
export async function tryPayPalNow() {
  if (paypalStatus().simulated) return;
  const p = getPaymentProvider() as unknown as { name: string; http?: { accessToken: () => Promise<string> } };
  if (p.name !== "paypal" || !p.http) {
    recordPayPalOk();
  } else {
    try {
      await p.http.accessToken();
      recordPayPalOk();
    } catch {
      // still down; the notice stays
    }
  }
  revalidatePath("/", "layout");
}
