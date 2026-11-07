import { and, eq, inArray } from "drizzle-orm";
import { AgentPrefs, levelFor, type SwapMessage, type TradeTerms } from "@/lib/protocol";
import { decryptPrivateKey, signMessage, verifySignature } from "@/lib/crypto/sign";
import { db as getDb } from "@/lib/db/client";
import { appendLedger } from "@/lib/db/ledger";
import * as s from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";
import { publish } from "@/lib/realtime/bus";
import { canonicalJson, validateTrade } from "@/lib/treasury";
import { now } from "./clock";
import { EngineError, memberActor } from "./types";

/** Text both members sign: the exact agreed terms. */
export const tradeMessage = (tradeId: string, t: TradeTerms) => canonicalJson({ tradeId, ...t });

export async function loadTradeContext(circleId: string) {
  const db = getDb();
  const [circle] = await db.select().from(s.circles).where(eq(s.circles.id, circleId));
  if (!circle) throw new EngineError("NOT_FOUND", "circle not found");
  const rounds = await db.select().from(s.rounds).where(eq(s.rounds.circleId, circleId));
  const ms = await db.select({ m: s.memberships, member: s.members }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, circleId));
  const collected = new Set(rounds.filter((r) => r.status === "PAID_OUT").map((r) => r.recipientMembershipId!));
  return {
    circle,
    rounds,
    members: ms,
    ctx: {
      pot: circle.contributionAmount * circle.size,
      size: circle.size,
      tier: circle.protectionTier,
      rounds: rounds.map((r) => ({ seq: r.seq, status: r.status, recipientMembershipId: r.recipientMembershipId! })),
      collected,
      prefs: Object.fromEntries(ms.map((x) => [x.m.id, AgentPrefs.parse(x.m.agentPrefsJson ?? {})])),
      scoreTiers: Object.fromEntries(ms.map((x) => [x.m.id, levelFor(x.member.circleScore).tier])),
    },
  };
}

export async function openSwapRequest(circleId: string, fromMembershipId: string, reason: string) {
  const db = getDb();
  const { rounds } = await loadTradeContext(circleId);
  const mine = rounds.find((r) => r.recipientMembershipId === fromMembershipId);
  if (!mine || mine.status !== "SCHEDULED") throw new EngineError("CONFLICT", "your turn cannot be swapped now");
  const live = await db.select().from(s.turnTrades).where(and(eq(s.turnTrades.circleId, circleId), eq(s.turnTrades.fromMembership, fromMembershipId), inArray(s.turnTrades.status, ["NEGOTIATING", "AGREED"])));
  if (live[0]) return live[0];
  const [t] = await db.insert(s.turnTrades).values({ id: uuidv7(), circleId, fromMembership: fromMembershipId, fromRoundSeq: mine.seq, status: "NEGOTIATING", transcriptJson: [{ at: new Date().toISOString(), msg: { kind: "SWAP_REQUEST", fromMembership: fromMembershipId, maxBonus: 0, reason } }] }).returning();
  await publish(circleId, "trade.updated", { ids: [t!.id] });
  return t!;
}

export async function appendTranscript(tradeId: string, entries: { msg: SwapMessage; by: string }[]) {
  const db = getDb();
  const [t] = await db.select().from(s.turnTrades).where(eq(s.turnTrades.id, tradeId));
  if (!t) throw new EngineError("NOT_FOUND", "trade not found");
  const transcript = [...(t.transcriptJson as unknown[]), ...entries.map((e) => ({ at: new Date().toISOString(), ...e }))];
  await db.update(s.turnTrades).set({ transcriptJson: transcript, updatedAt: new Date() }).where(eq(s.turnTrades.id, tradeId));
  await publish(t.circleId, "trade.updated", { ids: [tradeId] });
}

/** Agents agreed. The validator runs on the exact terms before either human is asked to sign. */
export async function markAgreed(tradeId: string, terms: TradeTerms) {
  const db = getDb();
  const [t] = await db.select().from(s.turnTrades).where(eq(s.turnTrades.id, tradeId));
  if (!t || t.status !== "NEGOTIATING") throw new EngineError("CONFLICT", "trade is not negotiating");
  const { ctx } = await loadTradeContext(t.circleId);
  const v = validateTrade({ ...ctx, signaturesValid: true }, terms);
  if (!v.ok) {
    await db.update(s.turnTrades).set({ status: "REJECTED", updatedAt: new Date() }).where(eq(s.turnTrades.id, tradeId));
    await publish(t.circleId, "trade.updated", { ids: [tradeId] });
    return { ok: false as const, reasons: v.reasons };
  }
  await db.update(s.turnTrades).set({ status: "AGREED", toMembership: terms.toMembershipId, toRoundSeq: terms.toRoundSeq, bonusAmount: terms.bonus, updatedAt: new Date() }).where(eq(s.turnTrades.id, tradeId));
  await publish(t.circleId, "trade.updated", { ids: [tradeId] });
  return { ok: true as const };
}

export async function markExpired(tradeId: string, status: "EXPIRED" | "REJECTED" = "EXPIRED") {
  const db = getDb();
  const [t] = await db.update(s.turnTrades).set({ status, updatedAt: new Date() }).where(and(eq(s.turnTrades.id, tradeId), inArray(s.turnTrades.status, ["NEGOTIATING", "AGREED"]))).returning();
  if (t) await publish(t.circleId, "trade.updated", { ids: [tradeId] });
}

/** One human taps confirm: their key signs the terms. When both have signed, the swap is applied. */
export async function signTrade(tradeId: string, memberId: string) {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [t] = await tx.select().from(s.turnTrades).where(eq(s.turnTrades.id, tradeId)).for("update");
    if (!t || t.status !== "AGREED") throw new EngineError("CONFLICT", "trade is not waiting for signatures");
    const terms: TradeTerms = { fromMembershipId: t.fromMembership, toMembershipId: t.toMembership!, fromRoundSeq: t.fromRoundSeq, toRoundSeq: t.toRoundSeq!, bonus: t.bonusAmount };
    const parties = await tx.select({ m: s.memberships, member: s.members }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(inArray(s.memberships.id, [terms.fromMembershipId, terms.toMembershipId]));
    const me = parties.find((p) => p.member.id === memberId);
    if (!me) throw new EngineError("FORBIDDEN", "not a party to this trade");
    const msg = tradeMessage(t.id, terms);
    const sigs = { ...(t.signaturesJson as Record<string, string>) };
    sigs[me.m.id] = signMessage(decryptPrivateKey(me.member.privateKeyEnc!), msg);
    const allValid = parties.length === 2 && parties.every((p) => sigs[p.m.id] && verifySignature(p.member.publicKey, msg, sigs[p.m.id]!));
    await tx.update(s.turnTrades).set({ signaturesJson: sigs, updatedAt: new Date() }).where(eq(s.turnTrades.id, tradeId));
    if (!allValid) return { circleId: t.circleId, confirmed: false };

    // Re-validate under lock with real signatures, then swap the two rounds' recipients.
    const rounds = await tx.select().from(s.rounds).where(eq(s.rounds.circleId, t.circleId)).for("update");
    const { ctx } = await loadTradeContext(t.circleId);
    const v = validateTrade({ ...ctx, rounds: rounds.map((r) => ({ seq: r.seq, status: r.status, recipientMembershipId: r.recipientMembershipId! })), signaturesValid: true }, terms);
    if (!v.ok) {
      await tx.update(s.turnTrades).set({ status: "REJECTED", updatedAt: new Date() }).where(eq(s.turnTrades.id, tradeId));
      return { circleId: t.circleId, confirmed: false, reasons: v.reasons };
    }
    const at = await now(tx);
    await appendLedger(tx, t.circleId, { type: "TRADE_CONFIRMED", tradeId, fromMembershipId: terms.fromMembershipId, toMembershipId: terms.toMembershipId, fromSeq: terms.fromRoundSeq, toSeq: terms.toRoundSeq, bonus: terms.bonus }, memberActor(memberId), at);
    if (v.raiseTierTo) {
      const [c] = await tx.select().from(s.circles).where(eq(s.circles.id, t.circleId));
      await appendLedger(tx, t.circleId, { type: "TIER_RAISED", from: c!.protectionTier, to: v.raiseTierTo, reason: "a Newcomer moved into the first half" }, "worker", at);
      await tx.update(s.circles).set({ protectionTier: v.raiseTierTo }).where(eq(s.circles.id, t.circleId));
    }
    const early = rounds.find((r) => r.seq === terms.toRoundSeq)!;
    const late = rounds.find((r) => r.seq === terms.fromRoundSeq)!;
    await tx.update(s.rounds).set({ recipientMembershipId: terms.fromMembershipId, updatedAt: new Date() }).where(eq(s.rounds.id, early.id));
    await tx.update(s.rounds).set({ recipientMembershipId: terms.toMembershipId, updatedAt: new Date() }).where(eq(s.rounds.id, late.id));
    await tx.update(s.memberships).set({ position: terms.toRoundSeq }).where(eq(s.memberships.id, terms.fromMembershipId));
    await tx.update(s.memberships).set({ position: terms.fromRoundSeq }).where(eq(s.memberships.id, terms.toMembershipId));
    await tx.update(s.turnTrades).set({ status: "CONFIRMED", updatedAt: new Date() }).where(eq(s.turnTrades.id, tradeId));
    return { circleId: t.circleId, confirmed: true };
  });
  await publish(result.circleId, "trade.updated", { ids: [tradeId] });
  if (result.confirmed) await publish(result.circleId, "round.updated");
  return result;
}
