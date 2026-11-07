import type { Actor } from "@/lib/protocol";

export class EngineError extends Error {
  constructor(
    public code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID" | "PROVIDER",
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export const memberActor = (memberId: string): Actor => `member:${memberId}`;

export const PERIOD_MS = { DAILY: 86_400_000, WEEKLY: 7 * 86_400_000, MONTHLY: 30 * 86_400_000 } as const;
