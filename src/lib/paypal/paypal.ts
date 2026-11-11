import type { Cents, Currency } from "@/lib/protocol";
import { fromPayPalValue, toPayPalValue } from "./amount";
import { linkOf, PayPalClient, PayPalHttpError, type PayPalConfig } from "./client";
import type { ChargeResult, PaymentProvider, PayoutResult, Txn, VaultMember } from "./types";

type Link = { rel: string; href: string };
const money = (amount: Cents, currency: Currency) => ({ currency_code: currency, value: toPayPalValue(amount) });

/** Real PayPal REST (sandbox or live by base URL). Every call carries a VERIFY link to the doc it follows. */
export class PayPalProvider implements PaymentProvider {
  readonly name = "paypal" as const;
  private http: PayPalClient;

  constructor(
    private cfg: PayPalConfig,
    private extra: { webhookId?: string; productId?: string; brandName?: string } = {},
  ) {
    this.http = new PayPalClient(cfg);
  }

  // VERIFY: https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal
  async createVaultSetup(member: VaultMember) {
    const res = await this.http.request<{ id: string; links: Link[] }>("POST", "/v3/vault/setup-tokens", {
      requestId: `setup-${member.membershipId}`,
      body: {
        payment_source: {
          paypal: {
            description: "Shugaba circle contributions",
            usage_pattern: "IMMEDIATE",
            usage_type: "MERCHANT",
            customer_type: "CONSUMER",
            permit_multiple_payment_tokens: false,
            experience_context: {
              brand_name: this.extra.brandName ?? "Shugaba",
              shipping_preference: "NO_SHIPPING",
              return_url: member.returnUrl,
              cancel_url: member.cancelUrl,
            },
          },
        },
      },
    });
    return { setupTokenId: res.id, approvalUrl: linkOf(res.links, "approve") };
  }

  // VERIFY: https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal (step: create payment token)
  async confirmVault(setupTokenId: string) {
    const res = await this.http.request<{ id: string }>("POST", "/v3/vault/payment-tokens", {
      requestId: `vault-${setupTokenId}`,
      body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
    });
    return { vaultId: res.id };
  }

  // VERIFY: https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal (charge with vault_id; order returns COMPLETED)
  private failNext = new Set<string>();

  /**
   * Judge panel: the next vaulted charge whose custom id starts with this prefix is declined by the PayPal
   * sandbox itself (negative testing), so the real decline path runs end to end. Sandbox only.
   */
  forceFail(customIdPrefix: string) {
    if (!this.cfg.baseUrl.includes("sandbox")) throw new Error("forceFail only works against the PayPal sandbox");
    this.failNext.add(customIdPrefix);
  }

  async chargeVaulted(input: { vaultId: string; amount: Cents; currency: Currency; idempotencyKey: string; customId: string; description?: string }): Promise<ChargeResult> {
    const forced = [...this.failNext].find((p) => input.customId.startsWith(p));
    if (forced) this.failNext.delete(forced);
    try {
      const res = await this.http.request<{ id: string; status: string; purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[] }>("POST", "/v2/checkout/orders", {
        requestId: forced ? `${input.idempotencyKey}-declined` : input.idempotencyKey,
        mockResponse: forced ? JSON.stringify({ mock_application_codes: "INSTRUMENT_DECLINED" }) : undefined,
        body: {
          intent: "CAPTURE",
          purchase_units: [{ amount: money(input.amount, input.currency), custom_id: input.customId, description: input.description }],
          payment_source: { paypal: { vault_id: input.vaultId } },
        },
      });
      const capture = res.purchase_units?.[0]?.payments?.captures?.[0];
      if (res.status === "COMPLETED" && capture?.status === "COMPLETED") return { status: "COMPLETED", providerRef: capture.id };
      if (capture?.status === "PENDING") return { status: "PENDING", providerRef: capture.id };
      return { status: "FAILED", providerRef: capture?.id ?? res.id, reason: `order ${res.status}` };
    } catch (e) {
      if (e instanceof PayPalHttpError && e.status < 500) return { status: "FAILED", providerRef: null, reason: e.issue };
      throw e;
    }
  }

  // VERIFY: https://developer.paypal.com/docs/api/subscriptions/v1/#plans_create
  async createPlan(circle: { id: string; name: string; amount: Cents; currency: Currency; size: number; frequency: "DAILY" | "WEEKLY" | "MONTHLY" }) {
    if (!this.extra.productId) throw new Error("PAYPAL_PRODUCT_ID is required for subscription mode");
    const unit = { DAILY: "DAY", WEEKLY: "WEEK", MONTHLY: "MONTH" }[circle.frequency];
    const res = await this.http.request<{ id: string }>("POST", "/v1/billing/plans", {
      requestId: `plan-${circle.id}`,
      body: {
        product_id: this.extra.productId,
        name: `${circle.name} contribution`.slice(0, 127),
        billing_cycles: [
          { frequency: { interval_unit: unit, interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: circle.size, pricing_scheme: { fixed_price: money(circle.amount, circle.currency) } },
        ],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
      },
    });
    return { planId: res.id };
  }

  // VERIFY: https://developer.paypal.com/docs/api/subscriptions/v1/#subscriptions_create
  async createSubscription(input: { planId: string; customId: string; returnUrl: string; cancelUrl: string; email?: string }) {
    const res = await this.http.request<{ id: string; links: Link[] }>("POST", "/v1/billing/subscriptions", {
      requestId: `sub-${input.customId}`,
      body: {
        plan_id: input.planId,
        custom_id: input.customId,
        subscriber: input.email ? { email_address: input.email } : undefined,
        application_context: { brand_name: "Shugaba", shipping_preference: "NO_SHIPPING", user_action: "SUBSCRIBE_NOW", return_url: input.returnUrl, cancel_url: input.cancelUrl },
      },
    });
    const approvalUrl = linkOf(res.links, "approve");
    if (!approvalUrl) throw new Error("subscription has no approve link");
    return { subscriptionId: res.id, approvalUrl };
  }

  // VERIFY: https://developer.paypal.com/docs/api/subscriptions/v1/#subscriptions_cancel
  async cancelSubscription(id: string, reason: string) {
    await this.http.request("POST", `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { requestId: `cancel-${id}`, body: { reason: reason.slice(0, 127) } });
  }

  // VERIFY: https://developer.paypal.com/docs/api/orders/v2/#orders_create
  async createOrder(input: { amount: Cents; currency: Currency; customId: string; idempotencyKey: string; description: string; returnUrl: string; cancelUrl: string }) {
    const res = await this.http.request<{ id: string; links: Link[] }>("POST", "/v2/checkout/orders", {
      requestId: input.idempotencyKey,
      body: {
        intent: "CAPTURE",
        purchase_units: [{ amount: money(input.amount, input.currency), custom_id: input.customId, description: input.description.slice(0, 127) }],
        payment_source: { paypal: { experience_context: { brand_name: "Shugaba", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", return_url: input.returnUrl, cancel_url: input.cancelUrl } } },
      },
    });
    const approvalUrl = linkOf(res.links, "payer-action") ?? linkOf(res.links, "approve");
    if (!approvalUrl) throw new Error("order has no approval link");
    return { orderId: res.id, approvalUrl };
  }

  // VERIFY: https://developer.paypal.com/docs/api/orders/v2/#orders_capture
  async captureOrder(orderId: string, idempotencyKey: string): Promise<ChargeResult> {
    try {
      const res = await this.http.request<{ status: string; purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[] }>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { requestId: idempotencyKey, body: {} });
      const capture = res.purchase_units?.[0]?.payments?.captures?.[0];
      if (capture?.status === "COMPLETED") return { status: "COMPLETED", providerRef: capture.id };
      if (capture?.status === "PENDING") return { status: "PENDING", providerRef: capture.id };
      return { status: "FAILED", providerRef: capture?.id ?? null, reason: `capture ${capture?.status ?? res.status}` };
    } catch (e) {
      if (e instanceof PayPalHttpError && e.status < 500) return { status: "FAILED", providerRef: null, reason: e.issue };
      throw e;
    }
  }

  // VERIFY: https://developer.paypal.com/docs/api/payments.payouts-batch/v1/#payouts_post
  async sendPayout(input: { recipientEmail: string; amount: Cents; currency: Currency; senderItemId: string; senderBatchId: string; note?: string }): Promise<PayoutResult> {
    const res = await this.http.request<{ batch_header: { payout_batch_id: string; batch_status: string } }>("POST", "/v1/payments/payouts", {
      requestId: `payout-${input.senderBatchId}`,
      body: {
        sender_batch_header: { sender_batch_id: input.senderBatchId, email_subject: "Your Shugaba payout", email_message: input.note ?? "Your circle payout has arrived." },
        items: [{ recipient_type: "EMAIL", amount: { value: toPayPalValue(input.amount), currency: input.currency }, receiver: input.recipientEmail, sender_item_id: input.senderItemId, note: input.note ?? "Shugaba circle payout" }],
      },
    });
    const s = res.batch_header.batch_status;
    return { batchId: res.batch_header.payout_batch_id, itemId: "", status: s === "SUCCESS" ? "SUCCESS" : s === "DENIED" || s === "CANCELED" ? "FAILED" : "PENDING" };
  }

  // VERIFY: https://developer.paypal.com/docs/api/invoicing/v2/#invoices_create and #invoices_send
  async createAndSendInvoice(input: { recipientEmail: string; recipientName: string; amount: Cents; currency: Currency; invoiceRef: string; note: string; dueInDays: number }) {
    const due = new Date(Date.now() + input.dueInDays * 86_400_000).toISOString().slice(0, 10);
    const inv = await this.http.request<{ id: string }>("POST", "/v2/invoicing/invoices", {
      requestId: `inv-${input.invoiceRef}`,
      prefer: "return=representation",
      body: {
        detail: { currency_code: input.currency, invoice_number: input.invoiceRef.slice(0, 25), note: input.note.slice(0, 4000), payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: due } },
        invoicer: { business_name: "Shugaba" },
        primary_recipients: [{ billing_info: { email_address: input.recipientEmail, name: { given_name: input.recipientName } } }],
        items: [{ name: "Circle contribution covered by the Protection Pool", quantity: "1", unit_amount: money(input.amount, input.currency) }],
      },
    });
    await this.http.request("POST", `/v2/invoicing/invoices/${encodeURIComponent(inv.id)}/send`, { requestId: `inv-send-${input.invoiceRef}`, body: { send_to_recipient: true, send_to_invoicer: false } });
    const full = await this.http.request<{ detail?: { metadata?: { recipient_view_url?: string } } }>("GET", `/v2/invoicing/invoices/${encodeURIComponent(inv.id)}`);
    return { invoiceId: inv.id, payUrl: full.detail?.metadata?.recipient_view_url ?? "" };
  }

  // VERIFY: https://developer.paypal.com/docs/api/transaction-search/v1/ (data lags up to a few hours)
  async listTransactions(range: { start: Date; end: Date }): Promise<Txn[]> {
    const q = new URLSearchParams({ start_date: range.start.toISOString(), end_date: range.end.toISOString(), fields: "transaction_info", page_size: "500" });
    const res = await this.http.request<{ transaction_details?: { transaction_info: { transaction_id: string; transaction_initiation_date: string; transaction_amount: { value: string; currency_code: string }; custom_field?: string; transaction_status: string } }[] }>("GET", `/v1/reporting/transactions?${q}`);
    return (res.transaction_details ?? []).map(({ transaction_info: t }) => ({
      id: t.transaction_id,
      at: t.transaction_initiation_date,
      amount: Math.abs(fromPayPalValue(t.transaction_amount.value.replace("-", ""))) * (t.transaction_amount.value.startsWith("-") ? -1 : 1),
      currency: "USD" as const,
      customId: t.custom_field ?? null,
      status: t.transaction_status,
    }));
  }

  // VERIFY: https://developer.paypal.com/api/rest/webhooks/rest/#link-verifywebhooksignature
  async verifyWebhook(headers: Record<string, string | undefined>, rawBody: string) {
    if (!this.extra.webhookId) return false;
    const h = (k: string) => headers[k] ?? headers[k.toLowerCase()];
    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return false;
    }
    const res = await this.http.request<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      body: {
        auth_algo: h("paypal-auth-algo"),
        cert_url: h("paypal-cert-url"),
        transmission_id: h("paypal-transmission-id"),
        transmission_sig: h("paypal-transmission-sig"),
        transmission_time: h("paypal-transmission-time"),
        webhook_id: this.extra.webhookId,
        webhook_event: event,
      },
    });
    return res.verification_status === "SUCCESS";
  }
}
