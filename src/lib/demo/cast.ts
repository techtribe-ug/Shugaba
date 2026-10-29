import type { AgentPrefs, Language } from "@/lib/protocol";
import { stableId } from "@/lib/ids";

export type CastMember = {
  key: "amina" | "musa" | "ngozi" | "tunde" | "ifeoma" | "sani";
  name: string;
  city: string;
  country: string;
  language: Language;
  score: number;
  prefs: AgentPrefs;
};

/** The six seeded members of the golden path (spec 3 and 13). */
export const CAST: readonly CastMember[] = [
  { key: "amina", name: "Amina", city: "Kano", country: "NG", language: "ha", score: 760, prefs: { acceptSwapLater: false, minBonusBps: 0, maxBonus: 0 } },
  { key: "musa", name: "Musa", city: "Kano", country: "NG", language: "ha", score: 560, prefs: { acceptSwapLater: false, minBonusBps: 0, maxBonus: 0 } },
  { key: "ngozi", name: "Ngozi", city: "Houston", country: "US", language: "en", score: 740, prefs: { acceptSwapLater: false, minBonusBps: 0, maxBonus: 0 } },
  { key: "tunde", name: "Tunde", city: "London", country: "GB", language: "en", score: 690, prefs: { acceptSwapLater: false, minBonusBps: 0, maxBonus: 500 } },
  { key: "ifeoma", name: "Ifeoma", city: "Lagos", country: "NG", language: "pcm", score: 720, prefs: { acceptSwapLater: true, minBonusBps: 150, latestAcceptableRoundSeq: 6, maxBonus: 0 } },
  { key: "sani", name: "Sani", city: "Abuja", country: "NG", language: "ha", score: 700, prefs: { acceptSwapLater: false, minBonusBps: 0, maxBonus: 0 } },
];

export const castId = (key: CastMember["key"]) => stableId(`member:${key}`);
export const castEmail = (key: string) => `${key}@shugaba.demo`;
export const OPERATOR_EMAIL = "analyst@shugaba.demo";
export const OPERATOR_ID = stableId("member:analyst");
export const FAMILY_CIRCLE_ID = stableId("circle:family");
export const FAMILY_INVITE = "FAMILY26";

export function castPaypalEmail(key: string, env: Record<string, string | undefined> = process.env): string {
  return env[`SANDBOX_EMAIL_${key.toUpperCase()}`] || `${key}@example.com`;
}

export function castByMemberId(memberId: string): CastMember | undefined {
  return CAST.find((c) => castId(c.key) === memberId);
}
