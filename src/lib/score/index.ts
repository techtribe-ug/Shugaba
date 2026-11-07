import { clampScore, levelFor, type ScoreTier } from "@/lib/protocol";
import { sha256Hex } from "@/lib/treasury";

/** Spec 9: every score change has a type and a fixed delta. */
export const SCORE_DELTAS = {
  ON_TIME: 4,
  PAID_IN_GRACE: 1,
  MISSED: -15,
  RECOVERED: 10,
  WRITTEN_OFF: -60,
  CYCLE_COMPLETED: 25,
  CYCLE_COMPLETED_AFTER_EARLY: 35,
  TENURE_MONTH: 1,
  LEFT_SHORT_NOTICE: -10,
} as const;
export type ScoreEventType = keyof typeof SCORE_DELTAS;

export const TENURE_CAP = 60;

export function applyScore(score: number, type: ScoreEventType): { score: number; delta: number } {
  const next = clampScore(score + SCORE_DELTAS[type]);
  return { score: next, delta: next - score };
}

export function tierOf(score: number): ScoreTier {
  return levelFor(score).tier;
}

/** Completed the cycle; collecting in the first half earns the bigger bonus. */
export function completionEvent(position: number, size: number): ScoreEventType {
  return position <= Math.floor(size / 2) ? "CYCLE_COMPLETED_AFTER_EARLY" : "CYCLE_COMPLETED";
}

export type OrderCandidate = { membershipId: string; score: number };

/** Seeded shuffle value for tie-breaks: deterministic from the rules hash, shown to members. */
async function tieKey(seed: string, id: string): Promise<string> {
  return sha256Hex(`${seed}:${id}`);
}

/**
 * Smart order: score descending; ties broken by a shuffle seeded with sha256(rules hash).
 * Returns the order and the seed so members can check it.
 */
export async function smartOrder(candidates: readonly OrderCandidate[], rulesHash: string): Promise<{ order: string[]; seed: string }> {
  const seed = await sha256Hex(rulesHash);
  const keyed = await Promise.all(candidates.map(async (c) => ({ ...c, k: await tieKey(seed, c.membershipId) })));
  keyed.sort((a, b) => b.score - a.score || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return { order: keyed.map((c) => c.membershipId), seed };
}

/** Newcomers (Bronze) placed in the first half raise the circle's protection to PLUS for the cycle. */
export function needsPlusTier(order: readonly string[], scores: Readonly<Record<string, number>>): boolean {
  const half = Math.floor(order.length / 2);
  return order.slice(0, half).some((id) => tierOf(scores[id] ?? 550) === "BRONZE");
}
