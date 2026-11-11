/**
 * Is PayPal answering? (design: GStates "PayPal down"). One per process, like the provider.
 * Real failures come from the PayPal client (network errors, 5xx/429 after retries). In demo mode the judge panel can
 * also simulate an outage, so judges can watch money stop safely and resume.
 */
type Health = { simulated: boolean; lastOkAt: number; lastFailAt: number; lastError: string | null };

const g = globalThis as unknown as { __shugabaPayPalHealth?: Health };
const state = (): Health => (g.__shugabaPayPalHealth ??= { simulated: false, lastOkAt: 0, lastFailAt: 0, lastError: null });

/** A failure counts as "PayPal is down" for this long unless a later call succeeds. */
const DOWN_WINDOW_MS = 10 * 60_000;

export class PayPalUnavailableError extends Error {
  constructor(reason = "PayPal isn't answering") {
    super(reason);
    this.name = "PayPalUnavailableError";
  }
}

export function recordPayPalOk() {
  state().lastOkAt = Date.now();
}

export function recordPayPalFailure(reason: string) {
  const s = state();
  s.lastFailAt = Date.now();
  s.lastError = reason.slice(0, 200);
}

export function setSimulatedOutage(on: boolean) {
  const s = state();
  s.simulated = on;
  if (on) recordPayPalFailure("simulated outage (judge panel)");
  else recordPayPalOk();
}

export function paypalStatus() {
  const s = state();
  const recentFailure = s.lastFailAt > s.lastOkAt && Date.now() - s.lastFailAt < DOWN_WINDOW_MS;
  const down = s.simulated || recentFailure;
  return { down, simulated: s.simulated, since: down && s.lastFailAt ? new Date(s.lastFailAt) : null, reason: down ? s.lastError : null };
}

/** Throws if PayPal is (simulated) down, so nothing half-moves. */
export function assertPayPalAvailable() {
  if (state().simulated) throw new PayPalUnavailableError("PayPal isn't answering (simulated outage)");
}
