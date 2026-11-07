import { createHash } from "node:crypto";
import type { Cents } from "@/lib/protocol";
import type { ChargeResult, PaymentProvider, PayoutResult, ProviderEvent, Txn } from "./types";

type Sink = (e: ProviderEvent) => void | Promise<void>;

/**
 * Deterministic stand-in for PayPal. Same idempotency rules as the real API: replaying a request id
 * returns the first result. `forceFail` makes the next charge for a custom id fail (judge panel).
 */
export class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  private results = new Map<string, unknown>();
  private failNext = new Set<string>();
  private txns: Txn[] = [];
  private orders = new Map<string, { amount: Cents; customId: string; captured: boolean }>();
  private n = 0;
  constructor(private sink: Sink = () => {}) {}

  setSink(sink: Sink) {
    this.sink = sink;
  }

  /** Fail the next charge whose customId starts with this prefix (e.g. a membership id). */
  forceFail(customIdPrefix: string) {
    this.failNext.add(customIdPrefix);
  }

  private id(prefix: string, seed: string) {
    return `${prefix}-${createHash("sha256").update(seed).digest("hex").slice(0, 16).toUpperCase()}`;
  }

  private once<T>(key: string, fn: () => T): T {
    if (this.results.has(key)) return this.results.get(key) as T;
    const r = fn();
    this.results.set(key, r);
    return r;
  }

  private async emit(type: string, resource: Record<string, unknown>) {
    this.n += 1;
    await this.sink({ id: `WH-MOCK-${this.n}-${Date.now()}`, type, resource, createdAt: new Date().toISOString() });
  }

  private takeFail(customId: string): boolean {
    for (const p of this.failNext) {
      if (customId.startsWith(p)) {
        this.failNext.delete(p);
        return true;
      }
    }
    return false;
  }

  async createVaultSetup(member: { membershipId: string }) {
    return { setupTokenId: this.id("SETUP", member.membershipId) };
  }

  async confirmVault(setupTokenId: string) {
    return { vaultId: this.id("VAULT", setupTokenId) };
  }

  async chargeVaulted(input: { vaultId: string; amount: Cents; currency?: string; idempotencyKey: string; customId: string }): Promise<ChargeResult> {
    const result = this.once(`charge:${input.idempotencyKey}`, (): ChargeResult => {
      if (this.takeFail(input.customId)) return { status: "FAILED", providerRef: null, reason: "INSTRUMENT_DECLINED" };
      const ref = this.id("CAP", input.idempotencyKey);
      this.txns.push({ id: ref, at: new Date().toISOString(), amount: input.amount, currency: "USD", customId: input.customId, status: "S" });
      return { status: "COMPLETED", providerRef: ref };
    });
    await this.emit(result.status === "COMPLETED" ? "PAYMENT.CAPTURE.COMPLETED" : "PAYMENT.CAPTURE.DENIED", { id: result.providerRef, custom_id: input.customId, amount: input.amount });
    return result;
  }

  async createPlan(circle: { id: string }) {
    return { planId: this.id("P", circle.id) };
  }

  async createSubscription(input: { customId: string }) {
    const subscriptionId = this.id("I", input.customId);
    return { subscriptionId, approvalUrl: `/mock/approve?subscription=${subscriptionId}` };
  }

  async cancelSubscription() {}

  async createOrder(input: { amount: Cents; customId: string; idempotencyKey: string }) {
    return this.once(`order:${input.idempotencyKey}`, () => {
      const orderId = this.id("ORDER", input.idempotencyKey);
      this.orders.set(orderId, { amount: input.amount, customId: input.customId, captured: false });
      return { orderId, approvalUrl: `/mock/approve?order=${orderId}` };
    });
  }

  async captureOrder(orderId: string, idempotencyKey: string): Promise<ChargeResult> {
    const order = this.orders.get(orderId);
    if (!order) return { status: "FAILED", providerRef: null, reason: "ORDER_NOT_FOUND" };
    return this.once(`capture:${idempotencyKey}`, (): ChargeResult => {
      if (order.captured) return { status: "FAILED", providerRef: null, reason: "ORDER_ALREADY_CAPTURED" };
      order.captured = true;
      const ref = this.id("CAP", orderId);
      this.txns.push({ id: ref, at: new Date().toISOString(), amount: order.amount, currency: "USD", customId: order.customId, status: "S" });
      return { status: "COMPLETED", providerRef: ref };
    });
  }

  async sendPayout(input: { amount: Cents; senderItemId: string; senderBatchId: string }): Promise<PayoutResult> {
    const r = this.once(`payout:${input.senderBatchId}`, (): PayoutResult => ({ batchId: this.id("BATCH", input.senderBatchId), itemId: this.id("ITEM", input.senderItemId), status: "SUCCESS" }));
    await this.emit("PAYMENT.PAYOUTS-ITEM.SUCCEEDED", { payout_item_id: r.itemId, payout_batch_id: r.batchId, sender_item_id: input.senderItemId, sender_batch_id: input.senderBatchId });
    return r;
  }

  async createAndSendInvoice(input: { invoiceRef: string }) {
    return this.once(`invoice:${input.invoiceRef}`, () => {
      const invoiceId = this.id("INV2", input.invoiceRef);
      return { invoiceId, payUrl: `/mock/invoice/${invoiceId}` };
    });
  }

  async listTransactions(range: { start: Date; end: Date }) {
    return this.txns.filter((t) => t.at >= range.start.toISOString() && t.at <= range.end.toISOString());
  }

  async verifyWebhook(headers: Record<string, string | undefined>) {
    return headers["x-mock-signature"] === "valid";
  }
}
