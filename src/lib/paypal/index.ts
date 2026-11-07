import { MockProvider } from "./mock";
import { PayPalProvider } from "./paypal";
import type { PaymentProvider } from "./types";

export * from "./types";
export { MockProvider } from "./mock";
export { PayPalProvider } from "./paypal";
export { toPayPalValue, fromPayPalValue } from "./amount";

const g = globalThis as unknown as { __shugabaPayments?: PaymentProvider };

/** PAYMENT_PROVIDER=mock (default) or paypal. One instance per process so the mock keeps its state. */
export function getPaymentProvider(env: Record<string, string | undefined> = process.env): PaymentProvider {
  if (g.__shugabaPayments) return g.__shugabaPayments;
  if (env.PAYMENT_PROVIDER === "paypal") {
    const { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: clientSecret } = env;
    if (!clientId || !clientSecret) throw new Error("PAYMENT_PROVIDER=paypal needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
    g.__shugabaPayments = new PayPalProvider(
      { baseUrl: env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com", clientId, clientSecret },
      { webhookId: env.PAYPAL_WEBHOOK_ID, productId: env.PAYPAL_PRODUCT_ID },
    );
  } else {
    g.__shugabaPayments = new MockProvider();
  }
  return g.__shugabaPayments;
}

export function getMockProvider(): MockProvider | null {
  const p = getPaymentProvider();
  return p instanceof MockProvider ? p : null;
}
