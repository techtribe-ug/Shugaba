import { eq } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { appendLedger } from "@/lib/db/ledger";
import * as s from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";
import { applyScore, type ScoreEventType } from "@/lib/score";

const REASONS: Record<ScoreEventType, string> = {
  ON_TIME: "Paid on time",
  PAID_IN_GRACE: "Paid within grace",
  MISSED: "Missed a payment; the pool covered it",
  RECOVERED: "Repaid in full",
  WRITTEN_OFF: "Missed payment written off",
  CYCLE_COMPLETED: "Completed a full cycle",
  CYCLE_COMPLETED_AFTER_EARLY: "Completed a cycle after collecting early",
  TENURE_MONTH: "Another month as a member",
  LEFT_SHORT_NOTICE: "Left with less than a round's notice",
};

/** Every score change writes score_events and a SCORE_CHANGED ledger event (spec 9). */
export async function changeScore(tx: Tx, memberId: string, circleId: string, type: ScoreEventType, at: Date) {
  const [m] = await tx.select({ score: s.members.circleScore }).from(s.members).where(eq(s.members.id, memberId)).for("update");
  const { score, delta } = applyScore(m!.score, type);
  if (delta === 0) return;
  await tx.update(s.members).set({ circleScore: score, updatedAt: new Date() }).where(eq(s.members.id, memberId));
  const e = await appendLedger(tx, circleId, { type: "SCORE_CHANGED", memberId, delta, score, reason: REASONS[type] }, "worker", at);
  await tx.insert(s.scoreEvents).values({ id: uuidv7(), memberId, circleId, type, delta, reason: REASONS[type], ledgerSeq: e.globalSeq });
}
