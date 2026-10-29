import { describe, expect, it } from "vitest";
import { fromPayPalValue, toPayPalValue } from "./amount";
import { MockProvider } from "./mock";
import { PayPalProvider } from "./paypal";
import type { PaymentProvider, ProviderEvent } from "./types";

describe("amount helpers", () => {
  it("formats cents as PayPal strings and back", () => {
    expect(toPayPalValue(5100)).toBe("51.00");
    expect(toPayPalValue(5)).toBe("0.05");
    expect(fromPayPalValue("295.5")).toBe(29550);
    expect(fromPayPalValue("305.00")).toBe(30500);
    expect(() => toPayPalValue(1.5)).toThrow();
  });
});

/** Contract every provider must meet; the sandbox run is skipped without credentials. */
function contract(name: string, make: () => PaymentProvider, opts: { failMembership?: (p: PaymentProvider, id: string) => void }) {
  describe(`${name} contract`, () => {
    it("vaults, charges idempotently, pays out and invoices", async () => {
      const p = make();
      const setup = await p.createVaultSetup({ membershipId: "m1", email: "a@example.com", name: "A", returnUrl: "http://localhost/r", cancelUrl: "http://localhost/c" });
      const { vaultId } = await p.confirmVault(setup.setupTokenId);
      const a = await p.chargeVaulted({ vaultId, amount: 5100, currency: "USD", idempotencyKey: "k1", customId: "m1:1" });
      const b = await p.chargeVaulted({ vaultId, amount: 5100, currency: "USD", idempotencyKey: "k1", customId: "m1:1" });
      expect(a.status).toBe("COMPLETED");
      expect(b).toEqual(a);
      const payout = await p.sendPayout({ recipientEmail: "a@example.com", amount: 30000, currency: "USD", senderItemId: "p1", senderBatchId: "r1" });
      expect(payout.batchId).toBeTruthy();
      const inv = await p.createAndSendInvoice({ recipientEmail: "m@example.com", recipientName: "Musa", amount: 5000, currency: "USD", invoiceRef: "rec1", note: "Covered", dueInDays: 7 });
      expect(inv.invoiceId).toBeTruthy();
    });
    if (opts.failMembership) {
      it("reports a declined charge as FAILED, not an exception", async () => {
        const p = make();
        opts.failMembership!(p, "m2");
        const r = await p.chargeVaulted({ vaultId: "v", amount: 5100, currency: "USD", idempotencyKey: "k2", customId: "m2:2" });
        expect(r.status).toBe("FAILED");
      });
    }
  });
}

contract("MockProvider", () => new MockProvider(), { failMembership: (p, id) => (p as MockProvider).forceFail(id) });

const sandbox = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.RUN_SANDBOX_TESTS === "true";
describe.skipIf(!sandbox)("PayPalProvider sandbox", () => {
  it("gets an OAuth token", async () => {
    const p = new PayPalProvider({ baseUrl: "https://api-m.sandbox.paypal.com", clientId: process.env.PAYPAL_CLIENT_ID!, clientSecret: process.env.PAYPAL_CLIENT_SECRET! });
    const s = await p.createVaultSetup({ membershipId: `t-${Date.now()}`, email: "x@example.com", name: "X", returnUrl: "https://example.com/r", cancelUrl: "https://example.com/c" });
    expect(s.approvalUrl).toMatch(/paypal\.com/);
  });
});

describe("PayPalProvider over a fake HTTP server", () => {
  function fakeFetch(routes: Record<string, (body: unknown, headers: Headers) => [number, unknown]>) {
    const calls: { url: string; headers: Headers; body: unknown }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body;
      calls.push({ url: path, headers, body });
      if (path === "/v1/oauth2/token") return new Response(JSON.stringify({ access_token: "T", expires_in: 3600 }), { status: 200 });
      const h = routes[path];
      if (!h) return new Response("{}", { status: 404 });
      const [status, out] = h(body, headers);
      return new Response(JSON.stringify(out), { status });
    }) as unknown as typeof fetch;
    return { f, calls };
  }

  it("sends PayPal-Request-Id and decimal amounts, retries 5xx, and maps declines", async () => {
    let n = 0;
    const { f, calls } = fakeFetch({
      "/v2/checkout/orders": (body) => {
        n++;
        if (n === 1) return [503, {}];
        const b = body as { purchase_units: { amount: { value: string } }[] };
        if (b.purchase_units[0]!.amount.value === "0.01") return [422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }] }];
        return [201, { id: "O1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "C1", status: "COMPLETED" }] } }] }];
      },
    });
    const p = new PayPalProvider({ baseUrl: "https://api-m.sandbox.paypal.com", clientId: "id", clientSecret: "s", fetchImpl: f, sleep: async () => {} });
    const ok = await p.chargeVaulted({ vaultId: "V", amount: 5100, currency: "USD", idempotencyKey: "idem-1", customId: "m:1" });
    expect(ok).toEqual({ status: "COMPLETED", providerRef: "C1" });
    const order = calls.filter((c) => c.url === "/v2/checkout/orders");
    expect(order).toHaveLength(2);
    expect(order[1]!.headers.get("PayPal-Request-Id")).toBe("idem-1");
    expect((order[1]!.body as { purchase_units: { amount: { value: string } }[] }).purchase_units[0]!.amount.value).toBe("51.00");
    const declined = await p.chargeVaulted({ vaultId: "V", amount: 1, currency: "USD", idempotencyKey: "idem-2", customId: "m:2" });
    expect(declined).toEqual({ status: "FAILED", providerRef: null, reason: "INSTRUMENT_DECLINED" });
  });
});

describe("MockProvider events", () => {
  it("emits webhook-shaped events", async () => {
    const seen: ProviderEvent[] = [];
    const p = new MockProvider((e) => {
      seen.push(e);
    });
    await p.chargeVaulted({ vaultId: "v", amount: 100, currency: "USD", idempotencyKey: "x", customId: "m:1" });
    expect(seen[0]!.type).toBe("PAYMENT.CAPTURE.COMPLETED");
  });
});
