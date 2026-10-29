import type { Bps, ProtectionTier } from "@/lib/protocol";

export type TierPolicy = {
  feeBps: Bps;
  /** Most unpaid contributions one round may cover. */
  coverLimit: number;
  /** Whether the global reserve backs the circle pool. */
  reserveBackstop: boolean;
};

export type TreasuryConfig = {
  tiers: Record<ProtectionTier, TierPolicy>;
  globalReserveShareBps: Bps;
  swapBonusCapBps: Bps;
};

export const DEFAULT_TREASURY_CONFIG: TreasuryConfig = {
  tiers: {
    BASIC: { feeBps: 100, coverLimit: 1, reserveBackstop: false },
    STANDARD: { feeBps: 200, coverLimit: 1, reserveBackstop: true },
    PLUS: { feeBps: 300, coverLimit: 2, reserveBackstop: true },
  },
  globalReserveShareBps: 2500,
  swapBonusCapBps: 500,
};

/** Reads fee bps from env (spec 14) and falls back to the defaults above. */
export function treasuryConfigFromEnv(env: Record<string, string | undefined>): TreasuryConfig {
  const num = (v: string | undefined, d: number) => {
    const n = v === undefined || v === "" ? NaN : Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 10_000 ? n : d;
  };
  const d = DEFAULT_TREASURY_CONFIG;
  return {
    ...d,
    tiers: {
      BASIC: { ...d.tiers.BASIC, feeBps: num(env.POOL_FEE_BPS_BASIC, d.tiers.BASIC.feeBps) },
      STANDARD: { ...d.tiers.STANDARD, feeBps: num(env.POOL_FEE_BPS_STANDARD, d.tiers.STANDARD.feeBps) },
      PLUS: { ...d.tiers.PLUS, feeBps: num(env.POOL_FEE_BPS_PLUS, d.tiers.PLUS.feeBps) },
    },
    globalReserveShareBps: num(env.GLOBAL_RESERVE_SHARE_BPS, d.globalReserveShareBps),
  };
}
