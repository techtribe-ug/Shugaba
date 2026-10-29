import { z } from "zod";
import { Cents, NonNegativeCents } from "./money";

/** A member agent's negotiation limits, set by its human. Bonus bps are relative to the pot. */
export const AgentPrefs = z
  .object({
    acceptSwapLater: z.boolean().default(false),
    minBonusBps: z.number().int().min(0).max(500).default(0),
    latestAcceptableRoundSeq: z.number().int().positive().optional(),
    maxBonus: NonNegativeCents.default(0),
  })
  .strip();
export type AgentPrefs = z.infer<typeof AgentPrefs>;

const membership = z.string().min(1);

/** Turn Market messages between member agents (spec 10.4). */
export const SwapMessage = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SWAP_REQUEST"), fromMembership: membership, wantedRoundSeq: z.number().int().positive().optional(), maxBonus: NonNegativeCents, reason: z.string().max(280) }),
  z.object({ kind: z.literal("OFFER"), fromMembership: membership, toMembership: membership, roundSeq: z.number().int().positive(), bonus: NonNegativeCents, rationale: z.string().max(280) }),
  z.object({ kind: z.literal("COUNTER"), fromMembership: membership, toMembership: membership, roundSeq: z.number().int().positive(), bonus: NonNegativeCents, rationale: z.string().max(280) }),
  z.object({ kind: z.literal("DECLINE"), fromMembership: membership, rationale: z.string().max(280) }),
  z.object({ kind: z.literal("AGREE"), fromMembership: membership }),
]);
export type SwapMessage = z.infer<typeof SwapMessage>;

export const MAX_NEGOTIATION_ROUNDS = 4;

/** Agreed terms. `from` is the requester moving to an earlier turn and pays the bonus out of that early payout. */
export const TradeTerms = z.object({
  fromMembershipId: membership,
  toMembershipId: membership,
  fromRoundSeq: z.number().int().positive(),
  toRoundSeq: z.number().int().positive(),
  bonus: Cents,
});
export type TradeTerms = z.infer<typeof TradeTerms>;
