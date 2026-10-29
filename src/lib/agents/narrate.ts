import { formatCents } from "@/lib/protocol";

export type NameOf = (membershipOrMemberId: string) => string;

export type Narration = { text: string; amount: number | null; kind: "in" | "out" | "cover" | "late" | "fail" | "info" | "swap" | "score" };

/**
 * One plain line per ledger event, for the circle feed and the ledger list (spec 11.2, /c/[id]/feed).
 * Outcomes only: never reasons, plans or another member's private details.
 */
export function narrate(type: string, p: Record<string, unknown>, name: NameOf): Narration | null {
  const n = (k: string) => name(String(p[k] ?? ""));
  const amt = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);
  switch (type) {
    case "CIRCLE_CREATED":
      return { text: `${String(p.name)} was created`, amount: null, kind: "info" };
    case "MEMBER_JOINED":
      return { text: `${n("membershipId")} joined`, amount: null, kind: "info" };
    case "RULES_SIGNED":
      return { text: `${n("membershipId")} signed the rules`, amount: null, kind: "info" };
    case "ORDER_SET":
      return { text: "The payout order was set", amount: null, kind: "info" };
    case "ROUND_OPENED":
      return { text: `Round ${String(p.seq)} opened for ${n("recipientMembershipId")}`, amount: null, kind: "info" };
    case "CONTRIBUTION_PAID":
      return { text: `${n("membershipId")} paid${p.late ? " (late)" : ""}`, amount: (amt("amount") ?? 0) + (amt("fee") ?? 0), kind: "in" };
    case "CONTRIBUTION_FAILED":
      return { text: `${n("membershipId")}'s payment didn't go through`, amount: null, kind: "fail" };
    case "GRACE_STARTED":
      return { text: "Grace started: 48 hours to pay", amount: null, kind: "late" };
    case "POOL_FEE_IN":
      return { text: "Protection fee in", amount: (amt("toPool") ?? 0) + (amt("toReserve") ?? 0), kind: "in" };
    case "POOL_COVER":
      return { text: `The pool covered ${n("membershipId")}`, amount: amt("amount"), kind: "cover" };
    case "RESERVE_COVER":
      return { text: "The reserve covered the rest", amount: amt("amount"), kind: "cover" };
    case "PAYOUT_SENT":
      return { text: `${n("recipientMembershipId")} got the payout`, amount: amt("amount"), kind: "out" };
    case "PAYOUT_CONFIRMED":
      return { text: "PayPal confirmed the payout", amount: null, kind: "info" };
    case "RECOVERY_OPENED":
      return { text: `${n("membershipId")} was sent an invoice`, amount: amt("amountDue"), kind: "late" };
    case "RECOVERY_PAYMENT":
      return { text: "A covered payment was paid back", amount: amt("amount"), kind: "in" };
    case "TRADE_CONFIRMED":
      return { text: `${n("fromMembershipId")} and ${n("toMembershipId")} swapped turns`, amount: null, kind: "swap" };
    case "BONUS_HELD":
      return { text: `Swap bonus held for ${n("forMembershipId")}`, amount: amt("amount"), kind: "swap" };
    case "BONUS_RELEASED":
      return { text: `Swap bonus added to ${n("toMembershipId")}'s payout`, amount: amt("amount"), kind: "swap" };
    case "TIER_RAISED":
      return { text: `Protection raised to ${String(p.to).toLowerCase()}`, amount: null, kind: "info" };
    case "CIRCLE_PAUSED":
      return { text: "The circle is paused for a check", amount: null, kind: "late" };
    case "CIRCLE_COMPLETED":
      return { text: "Every turn is paid. The circle is complete", amount: null, kind: "info" };
    case "MEMBER_LEFT":
      return { text: `${n("membershipId")} left the circle`, amount: null, kind: "info" };
    case "SEAT_OPENED":
      return { text: `Turn ${String(p.seq)} is open for a new member`, amount: null, kind: "info" };
    case "SEAT_FILLED":
      return { text: `${n("membershipId")} took the open seat`, amount: null, kind: "info" };
    case "OPEN_SEAT_POT":
      return { text: "The open seat's turn went back to the pool", amount: amt("toPool"), kind: "info" };
    case "LEAVER_REFUND_PAID":
      return { text: `${n("membershipId")} got their money back`, amount: null, kind: "out" };
    case "SCORE_CHANGED":
      return null; // private to the member
    default:
      return null;
  }
}

export function money(c: number | null): string {
  return c === null ? "" : formatCents(c);
}
