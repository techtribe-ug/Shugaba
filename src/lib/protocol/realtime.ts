import { z } from "zod";

export const RealtimeEventName = z.enum([
  "circle.updated",
  "round.updated",
  "contribution.updated",
  "payout.completed",
  "pool.updated",
  "trade.updated",
  "score.updated",
  "shugaba.message",
  "clock.ticked",
]);
export type RealtimeEventName = z.infer<typeof RealtimeEventName>;

/** Broadcast on channel `circle:<id>` after each committed change. Clients refetch; payloads stay small. */
export const RealtimeEvent = z.object({
  event: RealtimeEventName,
  circleId: z.string(),
  ledgerSeq: z.number().int().optional(),
  ids: z.array(z.string()).default([]),
  at: z.string(),
});
export type RealtimeEvent = z.infer<typeof RealtimeEvent>;

export const circleChannel = (circleId: string) => `circle:${circleId}`;
