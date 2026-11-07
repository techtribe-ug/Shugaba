import type { Cents } from "@/lib/protocol";

/** The only place cents become PayPal decimal strings (spec 0.4). */
export function toPayPalValue(amount: Cents): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`bad cents: ${amount}`);
  const whole = Math.floor(amount / 100);
  const frac = String(amount % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

export function fromPayPalValue(value: string): Cents {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new Error(`bad PayPal amount: ${value}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}
