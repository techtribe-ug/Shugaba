import { createHmac, timingSafeEqual } from "node:crypto";

export type Template = "payment_due" | "payment_failed" | "payout_sent" | "swap_request" | "security_alert" | "payment_received" | "hello_world";
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

  private async post(body: unknown): Promise<SendResult & { code?: number }> {
    // Graph API v26.0 is current (Nov 2026); override with WHATSAPP_GRAPH_VERSION.
    const url = `https://graph.facebook.com/${this.cfg.version ?? "v25.0"}/${this.cfg.phoneNumberId}/messages`;
    try {
      const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
      const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
      if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}`, code: json.error?.code };
      return { ok: true, providerMessageId: json.messages?.[0]?.id ?? null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async send(to: string, template: Template, params: string[], language: "en" | "ha"): Promise<SendResult> {
    const recipient = to.replace(/^\+/, "");
    // Meta's pre-approved test template takes no parameters and only exists in en_US.
    if (template === "hello_world") return this.post({ messaging_product: "whatsapp", to: recipient, type: "template", template: { name: "hello_world", language: { code: "en_US" } } });
    // Hausa templates are not submitted yet (they need a native speaker's review), so templates go out in English.
    const lang = language === "ha" && process.env.WHATSAPP_HAUSA_TEMPLATES === "true" ? "ha" : "en";
    const viaTemplate = await this.post({
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: { name: template, language: { code: lang }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
    });
    if (viaTemplate.ok) return viaTemplate;
    // Template missing or not approved yet: send the same words as plain text. Meta delivers that only inside the
    // 24 h window after the member last messaged us, which is enough for a demo where they say "hi" first.
    const viaText = await this.post({ messaging_product: "whatsapp", to: recipient, type: "text", text: { preview_url: true, body: `Shugaba: ${previewText(template, params)}` } });
    return viaText.ok ? viaText : { ok: false, error: `template: ${viaTemplate.error}; text: ${viaText.error}` };
  }
}

/** Our utility templates, as submitted to WhatsApp Manager (English). Example values are required by Meta. */
export const TEMPLATE_DEFS: { name: Exclude<Template, "hello_world">; body: string; example: string[] }[] = [
  { name: "payment_failed", body: "Your payment to {{1}} didn't go through. You have until {{2}} to pay. Open Shugaba: {{3}}", example: ["Family Circle", "14 Nov", "https://shugaba-demo.onrender.com/c/1/chat"] },
  { name: "payout_sent", body: "{{1}} from {{2}} is on its way to your PayPal.", example: ["$300", "Family Circle"] },
  { name: "payment_due", body: "Your {{1}} payment to {{2}} is due on {{3}}.", example: ["$51", "Family Circle", "14 Nov"] },
  { name: "payment_received", body: "We got your {{1}} for {{2}}, round {{3}}. Thank you. See it here: {{4}}", example: ["$51", "Family Circle", "2", "https://shugaba-demo.onrender.com/c/1/money"] },
  { name: "swap_request", body: "{{1}} wants to swap turns in {{2}}. Open Shugaba to see the offer.", example: ["Tunde", "Family Circle"] },
  { name: "security_alert", body: "Your payout account was changed. If this wasn't you, open Shugaba now.", example: [] },
];

/** True when real WhatsApp messages can be sent (Cloud API configured). Otherwise the UI shows "coming soon". */
export function whatsAppLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.WHATSAPP_MODE === "cloud" && !!env.WHATSAPP_PHONE_NUMBER_ID && !!env.WHATSAPP_ACCESS_TOKEN;
}

export function getChannel(env: Record<string, string | undefined> = process.env): NotificationChannel {
  if (env.WHATSAPP_MODE === "cloud") {
    if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) throw new Error("WHATSAPP_MODE=cloud needs WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN");
    return new WhatsAppChannel({ phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, token: env.WHATSAPP_ACCESS_TOKEN, version: env.WHATSAPP_GRAPH_VERSION });
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
    case "payment_received":
      return `We got your ${p[0]} for ${p[1]}, round ${p[2]}. Thank you. See it here: ${p[3]}`;
    case "hello_world":
      return "Hello World (Meta's WhatsApp test message: this phone is connected to Shugaba).";
    case "swap_request":
      return `${p[0]} wants to swap turns in ${p[1]}. Open Shugaba to see the offer.`;
    case "security_alert":
      return `Your payout account was changed. If this wasn't you, open Shugaba now.`;
    default:
      return p.join(" · ");
  }
}
