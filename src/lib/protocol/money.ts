import { z } from "zod";

/** Money is always an integer number of minor units (cents). */
export const Cents = z.number().int().safe();
export type Cents = number;

export const PositiveCents = Cents.positive();
export const NonNegativeCents = Cents.nonnegative();

/** Basis points: 100 bps = 1%. */
export const Bps = z.number().int().min(0).max(10_000);
export type Bps = number;

export function bpsOf(amount: Cents, bps: Bps): Cents {
  return Math.floor((amount * bps) / 10_000);
}

/** Display helper for UI only. PayPal formatting lives in src/lib/paypal. */
export function formatCents(amount: Cents, currency = "USD"): string {
  const whole = amount % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
