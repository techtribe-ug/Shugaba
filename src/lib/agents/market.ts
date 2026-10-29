import { bpsOf, MAX_NEGOTIATION_ROUNDS, type AgentPrefs, type SwapMessage, type TradeTerms } from "@/lib/protocol";
import { swapBonusCap } from "@/lib/treasury";

export type MarketMember = { membershipId: string; name: string; turnSeq: number; collected: boolean; prefs: AgentPrefs };

export type Rationale = (ctx: { speaker: string; kind: SwapMessage["kind"]; bonus?: number; turn?: number }) => Promise<string> | string;

/** Plain-language default rationales; the LLM version (agents/member.ts) can replace these. */
export const plainRationale: Rationale = ({ kind, bonus, turn }) => {
  const usd = (c?: number) => `$${((c ?? 0) / 100).toFixed(c && c % 100 ? 2 : 0)}`;
  switch (kind) {
    case "OFFER":
      return `I can take turn ${turn} for a ${usd(bonus)} bonus.`;
    case "COUNTER":
      return `I would need ${usd(bonus)} to move to turn ${turn}.`;
    case "DECLINE":
      return "My owner keeps their turn.";
    case "AGREE":
      return "Agreed.";
    default:
      return "";
  }
};

/**
 * Turn Market (spec 10.4). Each member agent answers inside its owner's prefs; code decides, the
 * model only words the rationale. At most 4 negotiation rounds. Returns the transcript and the
 * agreed terms, if any. The treasury validator still runs before anyone signs.
 */
export async function negotiate(input: {
  requester: MarketMember;
  others: readonly MarketMember[];
  pot: number;
  reason: string;
  rationale?: Rationale;
  /** Set when the member dragged onto one specific turn: only that member's agent is asked. */
  targetMembershipId?: string;
}): Promise<{ transcript: { by: string; msg: SwapMessage }[]; terms: TradeTerms | null }> {
  const { requester, pot } = input;
  const say = input.rationale ?? plainRationale;
  const cap = swapBonusCap(pot);
  const maxBonus = Math.min(requester.prefs.maxBonus, cap);
  const transcript: { by: string; msg: SwapMessage }[] = [
    { by: requester.name, msg: { kind: "SWAP_REQUEST", fromMembership: requester.membershipId, maxBonus, reason: input.reason.slice(0, 280) } },
  ];

  // Candidates hold an earlier, unpaid turn; nearest turn first.
  const candidates = input.others
    .filter((o) => !o.collected && o.turnSeq < requester.turnSeq && (!input.targetMembershipId || o.membershipId === input.targetMembershipId))
    .sort((a, b) => b.turnSeq - a.turnSeq);
  let rounds = 0;
  for (const o of candidates) {
    if (rounds >= MAX_NEGOTIATION_ROUNDS) break;
    rounds++;
    const willMove = o.prefs.acceptSwapLater && (o.prefs.latestAcceptableRoundSeq === undefined || requester.turnSeq <= o.prefs.latestAcceptableRoundSeq);
    if (!willMove) {
      transcript.push({ by: o.name, msg: { kind: "DECLINE", fromMembership: o.membershipId, rationale: await say({ speaker: o.name, kind: "DECLINE" }) } });
      continue;
    }
    // Ask for the owner's minimum, rounded up to whole dollars, never above the cap.
    const ask = Math.min(cap, Math.ceil(bpsOf(pot, o.prefs.minBonusBps) / 100) * 100);
    if (ask > maxBonus) {
      transcript.push({ by: o.name, msg: { kind: "COUNTER", fromMembership: o.membershipId, toMembership: requester.membershipId, roundSeq: o.turnSeq, bonus: ask, rationale: await say({ speaker: o.name, kind: "COUNTER", bonus: ask, turn: o.turnSeq }) } });
      transcript.push({ by: requester.name, msg: { kind: "DECLINE", fromMembership: requester.membershipId, rationale: "That is above my owner's limit." } });
      continue;
    }
    transcript.push({ by: o.name, msg: { kind: "OFFER", fromMembership: o.membershipId, toMembership: requester.membershipId, roundSeq: o.turnSeq, bonus: ask, rationale: await say({ speaker: o.name, kind: "OFFER", bonus: ask, turn: o.turnSeq }) } });
    transcript.push({ by: requester.name, msg: { kind: "AGREE", fromMembership: requester.membershipId } });
    return { transcript, terms: { fromMembershipId: requester.membershipId, toMembershipId: o.membershipId, fromRoundSeq: requester.turnSeq, toRoundSeq: o.turnSeq, bonus: ask } };
  }
  return { transcript, terms: null };
}
