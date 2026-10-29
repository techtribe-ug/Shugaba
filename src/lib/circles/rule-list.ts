import { formatCents } from "@/lib/protocol";
import { protectionFee } from "@/lib/treasury";

type CircleForRules = { contributionAmount: number; protectionTier: "BASIC" | "STANDARD" | "PLUS"; frequency: string; graceHours: number };

export const periodWord = (frequency: string) => (frequency === "WEEKLY" ? "week" : frequency === "DAILY" ? "day" : "month");

/** The plain-words rules every member signs. Shugaba cites them by number ("Rule 4"). */
export function ruleList(c: CircleForRules): [title: string, detail: string][] {
  const fee = protectionFee(c.contributionAmount, c.protectionTier);
  return [
    [`Pay ${formatCents(c.contributionAmount + fee.fee)} every ${periodWord(c.frequency)}`, `${formatCents(c.contributionAmount)} to the pot, ${formatCents(fee.fee)} to the protection pool.`],
    ["Turns follow Circle Score", "Highest score goes first. You can swap later."],
    [`Late? You get ${c.graceHours} hours`, "Then the pool covers you and you pay it back."],
    ["Payouts only go to your own PayPal", "Nobody can redirect your money."],
  ];
}

/** Rule numbers Shugaba cites in refusals. */
export const RULE = { PAY: 1, ORDER: 2, LATE: 3, OWN_PAYPAL: 4 } as const;
