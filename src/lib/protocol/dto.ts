import { z } from "zod";
import { Frequency, ProtectionTier, Language } from "./enums";
import { PositiveCents } from "./money";

/** Request bodies for route handlers and server actions. Unknown keys are stripped. */
export const CreateCircleInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    contributionAmount: PositiveCents.max(1_000_000),
    size: z.number().int().min(3).max(12),
    frequency: Frequency,
    protectionTier: ProtectionTier,
    graceHours: z.number().int().min(1).max(168).default(48),
  })
  .strip();
export type CreateCircleInput = z.infer<typeof CreateCircleInput>;

export const JoinCircleInput = z.object({ inviteCode: z.string().trim().min(4).max(32) }).strip();
export type JoinCircleInput = z.infer<typeof JoinCircleInput>;

export const DemoLoginInput = z.object({ memberId: z.string().min(1) }).strip();

export const ChatInput = z
  .object({ circleId: z.string().optional(), text: z.string().trim().min(1).max(1000), language: Language.optional() })
  .strip();
export type ChatInput = z.infer<typeof ChatInput>;
