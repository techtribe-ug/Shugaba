import { eq, inArray, sql } from "drizzle-orm";
import { encryptPrivateKey, generateSigningKeys, signMessage } from "@/lib/crypto/sign";
import { rulesFor, rulesHash } from "@/lib/circles/rules";
import { CAST, castEmail, castId, castPaypalEmail, FAMILY_CIRCLE_ID, FAMILY_INVITE, OPERATOR_EMAIL, OPERATOR_ID } from "@/lib/demo/cast";
import { stableId } from "@/lib/ids";
import type { Db } from "./client";
import { appendLedger } from "./ledger";
import * as s from "./schema";

export const RESERVE_SEED_CENTS = 250_000;

/**
 * Idempotent demo seed (spec 13). Members are upserted (keys kept); the demo circle and everything
 * hanging off it is rebuilt, so this also serves the judge panel's "Reset demo".
 */
export async function seedDemo(db: Db, opts: { now?: Date; clockSpeed?: number } = {}) {
  const now = opts.now ?? new Date();
  await db.transaction(async (tx) => {
    // Members.
    const people = [
      ...CAST.map((c) => ({ id: castId(c.key), name: c.name, email: castEmail(c.key), country: c.country, language: c.language, paypalEmail: castPaypalEmail(c.key), score: c.score, isOperator: false })),
      { id: OPERATOR_ID, name: "Treasury analyst", email: OPERATOR_EMAIL, country: "NG", language: "en" as const, paypalEmail: null, score: 550, isOperator: true },
    ];
    const existing = await tx.select({ id: s.members.id }).from(s.members).where(inArray(s.members.id, people.map((p) => p.id)));
    const have = new Set(existing.map((e) => e.id));
    for (const p of people) {
      if (have.has(p.id)) {
        await tx
          .update(s.members)
          .set({ name: p.name, email: p.email, country: p.country, language: p.language, paypalEmail: p.paypalEmail, paypalVaultId: null, circleScore: p.score, isOperator: p.isOperator, isDemo: true, updatedAt: now })
          .where(eq(s.members.id, p.id));
      } else {
        const keys = generateSigningKeys();
        await tx.insert(s.members).values({
          id: p.id,
          name: p.name,
          email: p.email,
          country: p.country,
          language: p.language,
          paypalEmail: p.paypalEmail,
          publicKey: keys.publicKey,
          privateKeyEnc: encryptPrivateKey(keys.privateKey),
          circleScore: p.score,
          isOperator: p.isOperator,
          isDemo: true,
        });
      }
    }

    // Wipe the demo circle (cascades to rounds, contributions, memberships...), its ledger and demo-member history.
    const castIds = CAST.map((c) => castId(c.key));
    await tx.delete(s.ledgerEvents).where(eq(s.ledgerEvents.circleId, FAMILY_CIRCLE_ID));
    await tx.delete(s.recoveries).where(sql`${s.recoveries.membershipId} in (select id from memberships where circle_id = ${FAMILY_CIRCLE_ID})`);
    await tx.delete(s.turnTrades).where(eq(s.turnTrades.circleId, FAMILY_CIRCLE_ID));
    await tx.delete(s.collectionMandates).where(sql`${s.collectionMandates.membershipId} in (select id from memberships where circle_id = ${FAMILY_CIRCLE_ID})`);
    await tx.delete(s.payouts).where(sql`${s.payouts.roundId} in (select id from rounds where circle_id = ${FAMILY_CIRCLE_ID})`);
    await tx.delete(s.contributions).where(sql`${s.contributions.roundId} in (select id from rounds where circle_id = ${FAMILY_CIRCLE_ID})`);
    await tx.delete(s.rounds).where(eq(s.rounds.circleId, FAMILY_CIRCLE_ID));
    await tx.delete(s.memberships).where(eq(s.memberships.circleId, FAMILY_CIRCLE_ID));
    await tx.delete(s.poolLedger).where(eq(s.poolLedger.circleId, FAMILY_CIRCLE_ID));
    await tx.delete(s.circleRules).where(eq(s.circleRules.circleId, FAMILY_CIRCLE_ID));
    await tx.delete(s.circles).where(eq(s.circles.id, FAMILY_CIRCLE_ID));
    await tx.delete(s.scoreEvents).where(inArray(s.scoreEvents.memberId, castIds));
    await tx.delete(s.agentMessages).where(inArray(s.agentMessages.memberId, castIds));
    await tx.delete(s.memberMemories).where(inArray(s.memberMemories.memberId, castIds));
    await tx.delete(s.proposals).where(inArray(s.proposals.memberId, castIds));
    await tx.delete(s.outboundMessages).where(inArray(s.outboundMessages.memberId, castIds));
    // WhatsApp opt-ins (spec 10.9): Musa and Tunde said yes at join. Fake numbers; mock mode never sends.
    await tx.delete(s.notificationChannels).where(inArray(s.notificationChannels.memberId, castIds));
    for (const [key, phone] of [["musa", "+2348000000002"], ["tunde", "+447700900004"]] as const) {
      await tx.insert(s.notificationChannels).values({ id: stableId(`whatsapp:${key}`), memberId: castId(key), channel: "whatsapp", phoneE164: phone, optedInAt: now, optInSource: "join" });
    }
    await tx.delete(s.agentMessages).where(eq(s.agentMessages.circleId, FAMILY_CIRCLE_ID));

    // Global reserve and the demo clock.
    await tx.delete(s.poolLedger).where(sql`${s.poolLedger.circleId} is null`);
    await tx.insert(s.globalReserve).values({ id: 1, balance: RESERVE_SEED_CENTS }).onConflictDoUpdate({ target: s.globalReserve.id, set: { balance: RESERVE_SEED_CENTS, updatedAt: now } });
    await tx.insert(s.poolLedger).values({ id: stableId("reserve:seed"), circleId: null, type: "RESERVE_IN", amount: RESERVE_SEED_CENTS, balanceAfter: RESERVE_SEED_CENTS, ref: "seed" });
    const speed = opts.clockSpeed ?? (Number(process.env.CLOCK_SPEED) || 1);
    await tx.insert(s.clock).values({ id: 1, anchorMs: now.getTime(), nowOffsetMs: 0, speed }).onConflictDoUpdate({ target: s.clock.id, set: { anchorMs: now.getTime(), nowOffsetMs: 0, speed, updatedAt: now } });

    // "Family Circle": FORMING, created by Amina, who has signed the rules.
    const amina = CAST[0]!;
    const circle = {
      id: FAMILY_CIRCLE_ID,
      name: "Family Circle",
      baseCurrency: "USD",
      contributionAmount: 5000,
      size: 6,
      frequency: "MONTHLY" as const,
      orderMode: "SMART" as const,
      protectionTier: "STANDARD" as const,
      graceHours: 48,
      status: "FORMING" as const,
      createdBy: castId("amina"),
      inviteCode: FAMILY_INVITE,
    };
    await tx.insert(s.circles).values(circle);
    const rules = rulesFor(circle);
    const hash = await rulesHash(rules);
    await tx.insert(s.circleRules).values({ circleId: circle.id, version: 1, rulesJson: rules, hash });
    const [aminaRow] = await tx.select().from(s.members).where(eq(s.members.id, castId("amina")));
    const { decryptPrivateKey } = await import("@/lib/crypto/sign");
    const signature = signMessage(decryptPrivateKey(aminaRow!.privateKeyEnc!), hash);
    const membershipId = stableId("membership:family:amina");
    await tx.insert(s.memberships).values({ id: membershipId, circleId: circle.id, memberId: castId("amina"), status: "SIGNED", signature, rulesHash: hash, agentPrefsJson: amina.prefs });
    await appendLedger(tx, circle.id, { type: "CIRCLE_CREATED", name: circle.name, rulesHash: hash, createdBy: castId("amina") }, `member:${castId("amina")}`, now);
    await appendLedger(tx, circle.id, { type: "MEMBER_JOINED", membershipId, position: null }, `member:${castId("amina")}`, now);
    await appendLedger(tx, circle.id, { type: "RULES_SIGNED", membershipId, rulesHash: hash }, `member:${castId("amina")}`, now);
  });
}
