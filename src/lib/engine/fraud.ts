import { and, eq, inArray } from "drizzle-orm";
import { db as getDb, type Tx } from "@/lib/db/client";
import { appendLedger } from "@/lib/db/ledger";
import * as s from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";
import { publish } from "@/lib/realtime/bus";
import { transitionCircle } from "@/lib/treasury";
import { canonicalJson } from "@/lib/treasury/canonical";
import { now } from "./clock";
import { EngineError } from "./types";

type Rule = (typeof s.fraudFlags.$inferInsert)["rule"];
const HOLD_WINDOW_MS = 48 * 3_600_000;

/** Inserts a flag unless the same one (rule, member, detail) already exists in any status. */
async function raise(tx: Tx, circleId: string, memberId: string | null, rule: Rule, detail: Record<string, unknown>) {
  const detailJson = { memberId, ...detail };
  const existing = await tx.select({ detail: s.fraudFlags.detailJson }).from(s.fraudFlags).where(and(eq(s.fraudFlags.circleId, circleId), eq(s.fraudFlags.rule, rule)));
  if (existing.some((f) => canonicalJson(f.detail) === canonicalJson(detailJson))) return null; // jsonb reorders keys
  const id = uuidv7();
  await tx.insert(s.fraudFlags).values({ id, circleId, memberId, rule, detailJson });
  return id;
}

/**
 * Rule 2 (spec 8.6), checked inside settlement: the recipient changed their PayPal method within 48 h
 * before this payout. Returns true when the payout must wait for an operator. A flag the operator
 * cleared for this round lets the payout go.
 */
export async function payoutNeedsReview(tx: Tx, circleId: string, roundId: string, recipientMembershipId: string, at: Date): Promise<boolean> {
  const [r] = await tx.select({ memberId: s.members.id, changedAt: s.members.paymentMethodChangedAt }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.id, recipientMembershipId));
  if (!r?.changedAt || at.getTime() - r.changedAt.getTime() > HOLD_WINDOW_MS) return false;
  const flags = await tx.select().from(s.fraudFlags).where(and(eq(s.fraudFlags.circleId, circleId), eq(s.fraudFlags.rule, "METHOD_CHANGED_BEFORE_PAYOUT"), eq(s.fraudFlags.memberId, r.memberId)));
  const forRound = flags.find((f) => (f.detailJson as { roundId?: string }).roundId === roundId);
  if (forRound?.status === "CLEARED") return false;
  if (!forRound) await raise(tx, circleId, r.memberId, "METHOD_CHANGED_BEFORE_PAYOUT", { roundId, changedAt: r.changedAt.toISOString() });
  return true;
}

/** Rules 1 and 3 (spec 8.6). Flags only; they never block money. Run by the nightly job and on demand. */
export async function scanCircle(circleId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const raised: string[] = [];
    const ms = await tx.select({ id: s.memberships.id, memberId: s.members.id, email: s.members.paypalEmail, vault: s.members.paypalVaultId, joinedAt: s.memberships.createdAt }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, circleId));
    // 1. Same PayPal email or vault id on two memberships.
    const seen = new Map<string, string>();
    for (const m of ms) {
      // The sandbox demo buyer (SANDBOX_DEMO_VAULT_ID) pays for every cast member on purpose; it is not a shared account.
      const demoVault = !!m.vault && m.vault === process.env.SANDBOX_DEMO_VAULT_ID;
      for (const k of [m.email ? `email:${m.email.toLowerCase()}` : null, m.vault && !demoVault ? `vault:${m.vault}` : null]) {
        if (!k) continue;
        const other = seen.get(k);
        if (other && other !== m.memberId) {
          const id = await raise(tx, circleId, m.memberId, "SHARED_PAYMENT_ACCOUNT", { otherMemberId: other, kind: k.split(":")[0] });
          if (id) raised.push(id);
        } else seen.set(k, m.memberId);
      }
    }
    // 3. Two or more members who joined within an hour of each other and both defaulted in the same round.
    const failed = await tx.select({ membershipId: s.contributions.membershipId, roundId: s.contributions.roundId }).from(s.contributions).innerJoin(s.rounds, eq(s.rounds.id, s.contributions.roundId)).where(and(eq(s.rounds.circleId, circleId), inArray(s.contributions.status, ["FAILED", "COVERED", "RECOVERED"])));
    const byRound = new Map<string, string[]>();
    for (const f of failed) byRound.set(f.roundId, [...(byRound.get(f.roundId) ?? []), f.membershipId]);
    for (const [roundId, ids] of byRound) {
      const group = ms.filter((m) => ids.includes(m.id));
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          if (Math.abs(group[i]!.joinedAt.getTime() - group[j]!.joinedAt.getTime()) < 3_600_000) {
            const id = await raise(tx, circleId, group[i]!.memberId, "JOINED_TOGETHER_DEFAULTED_TOGETHER", { otherMemberId: group[j]!.memberId, roundId });
            if (id) raised.push(id);
          }
    }
    return raised;
  });
}

/** Operator decisions (spec 4.2.7): each writes OPERATOR_ACTION with a reason. Clearing a rule-2 flag resumes the payout. */
export async function reviewFlag(flagId: string, operatorId: string, decision: "CLEARED" | "CONFIRMED", reason: string) {
  const db = getDb();
  if (reason.trim().length < 3) throw new EngineError("INVALID", "add a reason");
  const res = await db.transaction(async (tx) => {
    const [op] = await tx.select({ isOperator: s.members.isOperator }).from(s.members).where(eq(s.members.id, operatorId));
    if (!op?.isOperator) throw new EngineError("FORBIDDEN", "operators only");
    const [f] = await tx.select().from(s.fraudFlags).where(eq(s.fraudFlags.id, flagId)).for("update");
    if (!f) throw new EngineError("NOT_FOUND", "flag not found");
    if (f.status !== "OPEN") throw new EngineError("CONFLICT", "flag already reviewed");
    const at = await now(tx);
    await appendLedger(tx, f.circleId, { type: "OPERATOR_ACTION", operatorId, action: `${decision === "CLEARED" ? "cleared" : "confirmed"} fraud flag ${f.rule}`, reason: reason.trim() }, `operator:${operatorId}`, at);
    await tx.update(s.fraudFlags).set({ status: decision, updatedAt: new Date() }).where(eq(s.fraudFlags.id, flagId));
    return { circleId: f.circleId, resume: decision === "CLEARED" && f.rule === "METHOD_CHANGED_BEFORE_PAYOUT" };
  });
  if (res.resume) await resumeCircle(res.circleId, operatorId, "flag cleared after review", { skipLog: true });
  await publish(res.circleId, "circle.updated");
}

/** Operator resumes a paused circle; held rounds settle at once. */
export async function resumeCircle(circleId: string, operatorId: string, reason: string, opts: { skipLog?: boolean } = {}) {
  const db = getDb();
  const held = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(s.circles).where(eq(s.circles.id, circleId)).for("update");
    if (!c) throw new EngineError("NOT_FOUND", "circle not found");
    if (c.status !== "PAUSED") return [];
    const at = await now(tx);
    if (!opts.skipLog) {
      const [op] = await tx.select({ isOperator: s.members.isOperator }).from(s.members).where(eq(s.members.id, operatorId));
      if (!op?.isOperator) throw new EngineError("FORBIDDEN", "operators only");
      await appendLedger(tx, circleId, { type: "OPERATOR_ACTION", operatorId, action: "resumed circle", reason }, `operator:${operatorId}`, at);
    }
    await tx.update(s.circles).set({ status: transitionCircle("PAUSED", "ACTIVE"), updatedAt: new Date() }).where(eq(s.circles.id, circleId));
    return tx.select({ id: s.rounds.id }).from(s.rounds).where(and(eq(s.rounds.circleId, circleId), eq(s.rounds.status, "HELD")));
  });
  const { settleAndPay } = await import("./rounds");
  for (const r of held) await settleAndPay(r.id);
  await publish(circleId, "circle.updated");
}
