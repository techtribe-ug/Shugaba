import type { Cents, Currency } from "@/lib/protocol";

export type ChargeResult =
  | { status: "COMPLETED"; providerRef: string }
  | { status: "PENDING"; providerRef: string }
  | { status: "FAILED"; providerRef: string | null; reason: string };

export type PayoutResult = { batchId: string; itemId: string; status: "PENDING" | "SUCCESS" | "FAILED" };

export type Txn = { id: string; at: string; amount: Cents; currency: Currency; customId: string | null; status: string };

export type VaultMember = { membershipId: string; email: string; name: string; returnUrl: string; cancelUrl: string };

/** Spec 7.1. Amounts are integer cents everywhere outside this folder. */
export interface PaymentProvider {
  readonly name: "mock" | "paypal";
  createVaultSetup(member: VaultMember): Promise<{ approvalUrl?: string; setupTokenId: string }>;
  confirmVault(setupTokenId: string): Promise<{ vaultId: string }>;
  chargeVaulted(input: { vaultId: string; amount: Cents; currency: Currency; idempotencyKey: string; customId: string; description?: string }): Promise<ChargeResult>;
  createPlan(circle: { id: string; name: string; amount: Cents; currency: Currency; size: number; frequency: "DAILY" | "WEEKLY" | "MONTHLY" }): Promise<{ planId: string }>;
  createSubscription(input: { planId: string; customId: string; returnUrl: string; cancelUrl: string; email?: string }): Promise<{ subscriptionId: string; approvalUrl: string }>;
  cancelSubscription(id: string, reason: string): Promise<void>;
  createOrder(input: { amount: Cents; currency: Currency; customId: string; idempotencyKey: string; description: string; returnUrl: string; cancelUrl: string }): Promise<{ orderId: string; approvalUrl: string }>;
  captureOrder(orderId: string, idempotencyKey: string): Promise<ChargeResult>;
  sendPayout(input: { recipientEmail: string; amount: Cents; currency: Currency; senderItemId: string; senderBatchId: string; note?: string }): Promise<PayoutResult>;
  createAndSendInvoice(input: { recipientEmail: string; recipientName: string; amount: Cents; currency: Currency; invoiceRef: string; note: string; dueInDays: number }): Promise<{ invoiceId: string; payUrl: string }>;
  listTransactions(range: { start: Date; end: Date }): Promise<Txn[]>;
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): Promise<boolean>;
}

/** Normalised event the worker consumes, from a real webhook or from the mock. */
export type ProviderEvent = {
  id: string;
  type: string;
  resource: Record<string, unknown>;
  createdAt: string;
};
