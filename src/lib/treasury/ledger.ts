import { canonicalJson, sha256Hex } from "./canonical";

export const GENESIS_HASH = "0".repeat(64);

export type HashableEvent = {
  seq: number;
  circleId: string;
  type: string;
  payload: unknown;
  actor: string;
  createdAt: string;
};

export type ChainedEvent = HashableEvent & { prevHash: string; hash: string };

/** hash = sha256(prev_hash + canonical_json({seq, circle_id, type, payload, actor, created_at})) */
export async function hashEvent(prevHash: string, e: HashableEvent): Promise<string> {
  const body = canonicalJson({
    seq: e.seq,
    circle_id: e.circleId,
    type: e.type,
    payload: e.payload,
    actor: e.actor,
    created_at: e.createdAt,
  });
  return sha256Hex(prevHash + body);
}

export async function chainEvent(prev: { hash: string } | null, e: HashableEvent): Promise<ChainedEvent> {
  const prevHash = prev?.hash ?? GENESIS_HASH;
  return { ...e, prevHash, hash: await hashEvent(prevHash, e) };
}

export type VerifyResult = { ok: true; count: number } | { ok: false; brokenSeq: number; reason: string };

/** Recomputes every hash of one circle's chain, in seq order. Reports the first broken entry. */
export async function verifyChain(
  events: readonly ChainedEvent[],
  onProgress?: (index: number) => void,
): Promise<VerifyResult> {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.prevHash !== prevHash) return { ok: false, brokenSeq: e.seq, reason: "prev_hash does not match" };
    if ((await hashEvent(prevHash, e)) !== e.hash) return { ok: false, brokenSeq: e.seq, reason: "hash does not match" };
    prevHash = e.hash;
    onProgress?.(i);
  }
  return { ok: true, count: events.length };
}
