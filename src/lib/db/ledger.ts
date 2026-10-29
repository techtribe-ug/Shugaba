import { and, asc, desc, eq, sql } from "drizzle-orm";
import { LedgerEventPayload, type Actor } from "@/lib/protocol";
import { chainEvent, type ChainedEvent } from "@/lib/treasury";
import type { Db, Tx } from "./client";
import { ledgerEvents } from "./schema";

/**
 * Appends one event to a circle's hash chain inside the caller's transaction (spec 6.3: the ledger
 * event is written first, in the same transaction as the change). A per-circle advisory lock keeps
 * the chain linear under concurrency.
 */
export async function appendLedger(
  tx: Tx,
  circleId: string,
  payload: LedgerEventPayload,
  actor: Actor,
  at: Date,
): Promise<ChainedEvent & { globalSeq: number }> {
  const parsed = LedgerEventPayload.parse(payload);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ledger:" + circleId}))`);
  const [last] = await tx
    .select({ circleSeq: ledgerEvents.circleSeq, hash: ledgerEvents.hash })
    .from(ledgerEvents)
    .where(eq(ledgerEvents.circleId, circleId))
    .orderBy(desc(ledgerEvents.circleSeq))
    .limit(1);
  const { type, ...rest } = parsed;
  // Postgres keeps microseconds; hash the millisecond ISO string we store.
  const createdAt = new Date(Math.floor(at.getTime())).toISOString();
  const e = await chainEvent(last ? { hash: last.hash } : null, {
    seq: (last?.circleSeq ?? 0) + 1,
    circleId,
    type,
    payload: rest,
    actor,
    createdAt,
  });
  const [row] = await tx
    .insert(ledgerEvents)
    .values({ circleId, circleSeq: e.seq, type, payloadJson: rest, actor, prevHash: e.prevHash, hash: e.hash, createdAt: new Date(createdAt) })
    .returning({ seq: ledgerEvents.seq });
  return { ...e, globalSeq: row!.seq };
}

/** A circle's chain in order, in the shape the verifier hashes. */
export async function readChain(db: Db | Tx, circleId: string): Promise<ChainedEvent[]> {
  const rows = await db.select().from(ledgerEvents).where(and(eq(ledgerEvents.circleId, circleId))).orderBy(asc(ledgerEvents.circleSeq));
  return rows.map((r) => ({
    seq: r.circleSeq,
    circleId: r.circleId,
    type: r.type,
    payload: r.payloadJson,
    actor: r.actor,
    createdAt: r.createdAt.toISOString(),
    prevHash: r.prevHash,
    hash: r.hash,
  }));
}
