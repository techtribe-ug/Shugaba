import type { ScoreTier } from "./enums";

export const SCORE_MIN = 300;
export const SCORE_MAX = 850;
export const SCORE_START = 550;

export type Level = {
  tier: ScoreTier;
  title: "Newcomer" | "Steady" | "Trusted" | "Pillar";
  min: number;
  max: number;
  color: string;
};

/** Circle Score levels ("Awards from Pebble"). Titles replace the internal metal names in the UI. */
export const LEVELS: readonly Level[] = [
  { tier: "BRONZE", title: "Newcomer", min: 300, max: 549, color: "#B7703F" },
  { tier: "SILVER", title: "Steady", min: 550, max: 679, color: "#8E949E" },
  { tier: "GOLD", title: "Trusted", min: 680, max: 779, color: "#C98E12" },
  { tier: "DIAMOND", title: "Pillar", min: 780, max: 850, color: "#6D5BD0" },
];

export function clampScore(score: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(score)));
}

export function levelFor(score: number): Level {
  const s = clampScore(score);
  return LEVELS.find((l) => s >= l.min && s <= l.max) ?? LEVELS[0]!;
}
