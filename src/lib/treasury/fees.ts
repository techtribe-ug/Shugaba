import { bpsOf, type Cents, type ProtectionTier } from "@/lib/protocol";
import { DEFAULT_TREASURY_CONFIG, type TreasuryConfig } from "./config";

export type FeeSplit = { fee: Cents; toPool: Cents; toReserve: Cents };

/**
 * Protection fee on one contribution: floor(contribution × bps / 10000).
 * The reserve takes its share (floored); the remainder cents stay in the circle pool.
 */
export function protectionFee(
  contribution: Cents,
  tier: ProtectionTier,
  config: TreasuryConfig = DEFAULT_TREASURY_CONFIG,
): FeeSplit {
  if (!Number.isInteger(contribution) || contribution <= 0) throw new Error("contribution must be positive cents");
  const fee = bpsOf(contribution, config.tiers[tier].feeBps);
  const toReserve = bpsOf(fee, config.globalReserveShareBps);
  return { fee, toPool: fee - toReserve, toReserve };
}

export function potFor(contribution: Cents, size: number): Cents {
  return contribution * size;
}

/** Largest swap bonus the rules allow: 5% of the pot by default. */
export function swapBonusCap(pot: Cents, config: TreasuryConfig = DEFAULT_TREASURY_CONFIG): Cents {
  return bpsOf(pot, config.swapBonusCapBps);
}

/** Break-even protection fee (docs/pool-economics.md): f = p × (1 − r) × (1 + m). */
export function breakEvenFeeRate(defaultRate: number, recoveryRate: number, margin: number): number {
  return defaultRate * (1 - recoveryRate) * (1 + margin);
}
