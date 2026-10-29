import { CircleRules, DEFAULT_RULE_VALUES } from "@/lib/protocol";
import { canonicalJson, sha256Hex } from "@/lib/treasury";

type CircleLike = {
  name: string;
  baseCurrency: string;
  contributionAmount: number;
  size: number;
  frequency: CircleRules["frequency"];
  orderMode: CircleRules["orderMode"];
  protectionTier: CircleRules["protectionTier"];
  graceHours: number;
};

export function rulesFor(circle: CircleLike, version = 1): CircleRules {
  return CircleRules.parse({
    version,
    name: circle.name,
    currency: circle.baseCurrency,
    contributionAmount: circle.contributionAmount,
    size: circle.size,
    frequency: circle.frequency,
    orderMode: circle.orderMode,
    protectionTier: circle.protectionTier,
    graceHours: circle.graceHours,
    ...DEFAULT_RULE_VALUES,
  });
}

/** Canonical JSON (sorted keys), SHA-256. Members sign this hash. */
export async function rulesHash(rules: CircleRules): Promise<string> {
  return sha256Hex(canonicalJson(rules));
}
