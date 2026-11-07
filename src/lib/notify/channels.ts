import { createHmac, timingSafeEqual } from "node:crypto";

export type Template = "payment_due" | "payment_failed" | "payout_sent" | "swap_request" | "security_alert";
export type SendResult = { ok: true; providerMessageId: string | null } | { ok: false; error: string };

/** One way to reach a member (spec 10.9). A notice channel only: no money moves from a message. */
export interface NotificationChannel {
  readonly name: "mock" | "whatsapp";
  send(to: string, template: Template, params: string[], language: "en" | "ha"): Promise<SendResult>;
}

/** WHATSAPP_MODE=mock: writes only to outbound_messages (shown on the judge panel). */
export class MockChannel implements NotificationChannel {
  readonly name = "mock" as const;
  async send(): Promise<SendResult> {
    return { ok: true, providerMessageId: null };
  }
}

/**
 * WhatsApp Cloud API (Meta, direct). Utility templates only. VERIFY the Graph API version and the
 * template names approved in WhatsApp Manager before turning on WHATSAPP_MODE=cloud.
 */
export class WhatsAppChannel implements NotificationChannel {
  readonly name = "whatsapp" as const;
  constructor(private cfg: { phoneNumberId: string; token: string; version?: string }) {}
  async send(to: string, template: Template, params: string[], language: "en" | "ha"): Promise<SendResult> {
    const url = `https://graph.facebook.com/${this.cfg.version ?? "v21.0"}/${this.cfg.phoneNumberId}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: to.replace(/^\+/, ""),
      type: "template",
      template: { name: template, language: { code: language }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
    };
    try {
      const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
      const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
      if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
      return { ok: true, providerMessageId: json.messages?.[0]?.id ?? null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

export function getChannel(env: Record<string, string | undefined> = process.env): NotificationChannel {
  if (env.WHATSAPP_MODE === "cloud") {
    if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) throw new Error("WHATSAPP_MODE=cloud needs WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN");
    return new WhatsAppChannel({ phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, token: env.WHATSAPP_ACCESS_TOKEN });
  }
  return new MockChannel();
}

/** Meta signs webhook bodies with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function verifyMetaSignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** The approved template bodies, for the judge panel preview. Keep in step with WhatsApp Manager. */
export function previewText(template: string, p: string[]): string {
  switch (template) {
    case "payment_failed":
      return `Your payment to ${p[0]} didn't go through. You have until ${p[1]} to pay. Open Shugaba: ${p[2]}`;
    case "payout_sent":
      return `${p[0]} from ${p[1]} is on its way to your PayPal.`;
    case "payment_due":
      return `Your ${p[0]} payment to ${p[1]} is due on ${p[2]}.`;
    case "swap_request":
      return `${p[0]} wants to swap turns in ${p[1]}. Open Shugaba to see the offer.`;
    case "security_alert":
      return `Your payout account was changed. If this wasn't you, open Shugaba now.`;
    default:
      return p.join(" · ");
  }
}
