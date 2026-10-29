import { RULE } from "@/lib/circles/rule-list";

export type GuardHit = { kind: "REDIRECT_PAYOUT" | "MOVE_MONEY" | "CHANGE_RULES" | "OTHERS_DATA" | "INJECTION"; rule: number | null };

// Member messages are untrusted data (spec 10.1). These checks run in code before any model sees the text,
// so a refusal never depends on the model following its instructions. Covers en, pcm and ha phrasing.
const PATTERNS: { kind: GuardHit["kind"]; rule: number | null; re: RegExp }[] = [
  { kind: "INJECTION", rule: null, re: /\b(ignore|disregard|forget)\b.{0,30}\b(previous|above|prior|all|your)\b.{0,20}\b(instructions?|rules?|prompt)\b|\bsystem prompt\b|\bdeveloper mode\b|\byou are now\b|\bact as\b.{0,20}\b(admin|operator|treasury)\b|\bjailbreak\b/i },
  { kind: "REDIRECT_PAYOUT", rule: RULE.OWN_PAYPAL, re: /\b(send|pay|transfer|move|give|redirect|route)\b.{0,40}\b(payout|money|pot|turn|share|kudi|kudin|moni|owo)\b.{0,40}\b(to|into|give)\b.{0,30}\b(my|his|her|another|other|new|different|this|brother|sister|wife|husband|friend|account|number|wallet|bank)\b|\b(change|update|switch)\b.{0,20}\b(payout|paypal)\b.{0,20}\b(account|email|to)\b|\b(aika|tura|turo)\b.{0,30}\bkudi/i },
  { kind: "OTHERS_DATA", rule: null, re: /\b(what|show|give|tell|send)\b.{0,30}\b('s|s'|their|his|her)\b.{0,30}\b(email|paypal|phone|number|address|account|password)\b|\b(email|paypal|phone number|password)\b.{0,10}\bof\b.{0,20}\b[A-Z][a-z]+/i },
  { kind: "MOVE_MONEY", rule: null, re: /\b(release|withdraw|empty|drain|refund|pay out)\b.{0,30}\b(pool|reserve|pot|everything|all the money)\b|\b(pay|send)\b.{0,10}\bme\b.{0,20}\b(now|today|early|first)\b/i },
  { kind: "CHANGE_RULES", rule: RULE.ORDER, re: /\b(skip|change|break|bend|waive|cancel)\b.{0,20}\b(rule|rules|order|fee|fees)\b|\bmake me (first|go first|number one)\b|\bput me first\b/i },
];

export function guard(text: string): GuardHit | null {
  for (const p of PATTERNS) if (p.re.test(text)) return { kind: p.kind, rule: p.rule };
  return null;
}
