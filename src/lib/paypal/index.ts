import { MockProvider } from "./mock";
import { PayPalProvider } from "./paypal";
import type { PaymentProvider } from "./types";

export * from "./types";
export { MockProvider } from "./mock";
export { PayPalProvider } from "./paypal";
export { toPayPalValue, fromPayPalValue } from "./amount";
export { paypalStatus, setSimulatedOutage, recordPayPalOk, PayPalUnavailableError } from "./health";

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
  // Compare by name, not instanceof: the worker and the request handlers can load separate copies of the class.
  const p = getPaymentProvider();
  return p.name === "mock" ? (p as MockProvider) : null;
}

/** Demo reset: a fresh mock with no remembered results or forced failures. Keeps the worker's event sink. */
export function resetMockProvider() {
  const old = getMockProvider();
  if (!old) return;
  const fresh = new MockProvider();
  fresh.setSink((old as unknown as { sink: Parameters<MockProvider["setSink"]>[0] }).sink);
  g.__shugabaPayments = fresh;
}

/** Runs `fn` with a private mock provider, whatever PAYMENT_PROVIDER says. Used to seed history without touching PayPal. */
export async function withMockProvider<T>(fn: (mock: MockProvider) => Promise<T>): Promise<T> {
  const prev = g.__shugabaPayments;
  const mock = new MockProvider();
  g.__shugabaPayments = mock;
  try {
    return await fn(mock);
  } finally {
    g.__shugabaPayments = prev;
  }
}
