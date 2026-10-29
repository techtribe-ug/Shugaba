import { z } from "zod";
import { Currency, Frequency, OrderMode, ProtectionTier } from "./enums";
import { PositiveCents } from "./money";

/** The rules every member signs at join. Hashed as canonical JSON (sorted keys). */
export const CircleRules = z
  .object({
    version: z.number().int().positive(),
    name: z.string().min(1).max(80),
    currency: Currency,
    contributionAmount: PositiveCents,
    size: z.number().int().min(3).max(12),
    frequency: Frequency,
    orderMode: OrderMode,
    protectionTier: ProtectionTier,
    graceHours: z.number().int().min(1).max(168),
    swapBonusCapBps: z.number().int().min(0).max(500),
    lateFeeCents: z.number().int().nonnegative(),
    minRoundsPaidBeforeCollectForLateJoiner: z.number().int().min(0),
  })
  .strict();
export type CircleRules = z.infer<typeof CircleRules>;

export const DEFAULT_RULE_VALUES = {
  swapBonusCapBps: 500,
  lateFeeCents: 0,
  minRoundsPaidBeforeCollectForLateJoiner: 2,
} as const;
