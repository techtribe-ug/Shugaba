import { and, asc, eq, inArray } from "drizzle-orm";
import { AgentPrefs, type CreateCircleInput, type ProtectionTier } from "@/lib/protocol";
import { decryptPrivateKey, signMessage, verifySignature } from "@/lib/crypto/sign";
import { rulesFor, rulesHash } from "@/lib/circles/rules";
import { db as getDb, type Tx } from "@/lib/db/client";
import { appendLedger } from "@/lib/db/ledger";
import * as s from "@/lib/db/schema";
import { inviteCode, uuidv7 } from "@/lib/ids";
import { getPaymentProvider } from "@/lib/paypal";
import { publish } from "@/lib/realtime/bus";
import { needsPlusTier, smartOrder } from "@/lib/score";
import { transitionCircle } from "@/lib/treasury";
import { now } from "./clock";
import { EngineError, memberActor, PERIOD_MS } from "./types";

const collectionMode = () => (process.env.PAYMENT_PROVIDER === "paypal" ? ((process.env.COLLECTION_MODE ?? "vault").toUpperCase() as "VAULT" | "SUBSCRIPTION") : "MOCK");

/** Create a circle in FORMING with the creator as its first signed member. */
export async function createCircle(memberId: string, input: CreateCircleInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const at = await now(tx);
    const id = uuidv7();
    const circle = { id, name: input.name, baseCurrency: "USD", contributionAmount: input.contributionAmount, size: input.size, frequency: input.frequency, orderMode: "SMART" as const, protectionTier: input.protectionTier, graceHours: input.graceHours, status: "FORMING" as const, createdBy: memberId, inviteCode: inviteCode() };
    await tx.insert(s.circles).values(circle);
    const rules = rulesFor(circle);
    const hash = await rulesHash(rules);
    await tx.insert(s.circleRules).values({ circleId: id, version: 1, rulesJson: rules, hash });
    await appendLedger(tx, id, { type: "CIRCLE_CREATED", name: circle.name, rulesHash: hash, createdBy: memberId }, memberActor(memberId), at);
    await signAndJoin(tx, id, memberId, hash, at);
    return { id, inviteCode: circle.inviteCode };
  });
}

/** Member signs the rules hash with their key (demo: server-held, encrypted at rest). */
export async function signAndJoin(tx: Tx, circleId: string, memberId: string, hash: string, at: Date, prefs?: unknown) {
  const [member] = await tx.select().from(s.members).where(eq(s.members.id, memberId));
  if (!member?.privateKeyEnc) throw new EngineError("INVALID", "member has no signing key");
  const signature = signMessage(decryptPrivateKey(member.privateKeyEnc), hash);
  if (!verifySignature(member.publicKey, hash, signature)) throw new EngineError("INVALID", "signature check failed");
  const membershipId = uuidv7();
  await tx.insert(s.memberships).values({ id: membershipId, circleId, memberId, status: "SIGNED", signature, rulesHash: hash, agentPrefsJson: AgentPrefs.parse(prefs ?? {}) });
  await appendLedger(tx, circleId, { type: "MEMBER_JOINED", membershipId, position: null }, memberActor(memberId), at);
  await appendLedger(tx, circleId, { type: "RULES_SIGNED", membershipId, rulesHash: hash }, memberActor(memberId), at);
  return membershipId;
}

export async function circleByInvite(code: string) {
  const [c] = await getDb().select().from(s.circles).where(eq(s.circles.inviteCode, code.trim().toUpperCase()));
  return c ?? null;
}

/** Join by invite: sign rules, then set up automatic contributions. Returns a PayPal approval URL in vault mode. */
export async function joinCircle(memberId: string, code: string, opts: { prefs?: unknown; returnUrl?: string } = {}) {
  const db = getDb();
  const circle = await circleByInvite(code);
  if (!circle) throw new EngineError("NOT_FOUND", "invite not found");
  const result = await db.transaction(async (tx) => {
    const at = await now(tx);
    const [c] = await tx.select().from(s.circles).where(eq(s.circles.id, circle.id)).for("update");
    if (c!.status !== "FORMING") throw new EngineError("CONFLICT", "circle is not taking new members");
    const existing = await tx.select().from(s.memberships).where(eq(s.memberships.circleId, c!.id));
    const mine = existing.find((m) => m.memberId === memberId);
    if (mine) return { membershipId: mine.id, already: true };
    if (existing.length >= c!.size) throw new EngineError("CONFLICT", "circle is full");
    const [rules] = await tx.select().from(s.circleRules).where(eq(s.circleRules.circleId, c!.id)).orderBy(asc(s.circleRules.version));
    const membershipId = await signAndJoin(tx, c!.id, memberId, rules!.hash, at, opts.prefs);
    return { membershipId, already: false };
  });
  const mandate = await startMandate(result.membershipId, opts.returnUrl);
  await publish(circle.id, "circle.updated");
  return { circleId: circle.id, ...result, ...mandate };
}

/** Starts collection for one membership. Mock mode activates at once; vault mode returns an approval link. */
export async function startMandate(membershipId: string, returnUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/paypal/return`) {
  const db = getDb();
  const mode = collectionMode();
  const [row] = await db.select({ m: s.memberships, member: s.members }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.id, membershipId));
  if (!row) throw new EngineError("NOT_FOUND", "membership not found");
  if (mode === "MOCK") {
    await db.insert(s.collectionMandates).values({ membershipId, mode: "MOCK", status: "ACTIVE", providerVaultId: `MOCK-VAULT-${membershipId.slice(0, 8)}` }).onConflictDoUpdate({ target: s.collectionMandates.membershipId, set: { status: "ACTIVE", updatedAt: new Date() } });
    await db.update(s.memberships).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(s.memberships.id, membershipId));
    return { approvalUrl: null as string | null };
  }
  if (mode === "VAULT") {
    // A member who already saved PayPal (vault id on file) does not need to approve again.
    if (row.member.paypalVaultId) {
      await db.insert(s.collectionMandates).values({ membershipId, mode: "VAULT", status: "ACTIVE", providerVaultId: row.member.paypalVaultId }).onConflictDoUpdate({ target: s.collectionMandates.membershipId, set: { status: "ACTIVE", providerVaultId: row.member.paypalVaultId, updatedAt: new Date() } });
      await db.update(s.memberships).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(s.memberships.id, membershipId));
      return { approvalUrl: null };
    }
    const setup = await getPaymentProvider().createVaultSetup({ membershipId, email: row.member.paypalEmail ?? row.member.email, name: row.member.name, returnUrl: `${returnUrl}?membership=${membershipId}`, cancelUrl: `${returnUrl}?membership=${membershipId}&cancel=1` });
    await db.insert(s.collectionMandates).values({ membershipId, mode: "VAULT", status: "PENDING", providerPlanId: setup.setupTokenId }).onConflictDoUpdate({ target: s.collectionMandates.membershipId, set: { status: "PENDING", providerPlanId: setup.setupTokenId, updatedAt: new Date() } });
    return { approvalUrl: setup.approvalUrl ?? null };
  }
  throw new EngineError("INVALID", "subscription mode is not wired yet; use COLLECTION_MODE=vault");
}

/** PayPal sent the member back after approving: turn the setup token into a vault id. */
export async function confirmMandate(membershipId: string) {
  const db = getDb();
  const [mandate] = await db.select().from(s.collectionMandates).where(eq(s.collectionMandates.membershipId, membershipId));
  if (!mandate?.providerPlanId) throw new EngineError("NOT_FOUND", "no pending PayPal approval");
  const { vaultId } = await getPaymentProvider().confirmVault(mandate.providerPlanId);
  const [m] = await db.select().from(s.memberships).where(eq(s.memberships.id, membershipId));
  await db.transaction(async (tx) => {
    await tx.update(s.collectionMandates).set({ status: "ACTIVE", providerVaultId: vaultId, updatedAt: new Date() }).where(eq(s.collectionMandates.membershipId, membershipId));
    await tx.update(s.memberships).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(s.memberships.id, membershipId));
    // Fraud rule 2 watches for payment-method changes before a payout.
    // Linking PayPal for the first time is not a change; replacing a saved method is.
    const [member] = await tx.select({ vault: s.members.paypalVaultId }).from(s.members).where(eq(s.members.id, m!.memberId));
    const changed = !!member?.vault && member.vault !== vaultId;
    await tx.update(s.members).set({ paypalVaultId: vaultId, ...(changed ? { paymentMethodChangedAt: await now(tx) } : {}), updatedAt: new Date() }).where(eq(s.members.id, m!.memberId));
  });
  await publish(m!.circleId, "circle.updated");
  return { circleId: m!.circleId };
}

/** Smart order proposal from scores (spec 9). Does not change anything. */
export async function proposeOrder(circleId: string) {
  const db = getDb();
  const rows = await db.select({ id: s.memberships.id, score: s.members.circleScore, name: s.members.name }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(and(eq(s.memberships.circleId, circleId), inArray(s.memberships.status, ["SIGNED", "ACTIVE"])));
  const [rules] = await db.select().from(s.circleRules).where(eq(s.circleRules.circleId, circleId));
  const { order, seed } = await smartOrder(rows.map((r) => ({ membershipId: r.id, score: r.score })), rules!.hash);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { order: order.map((id) => ({ membershipId: id, name: byId.get(id)!.name, score: byId.get(id)!.score })), seed };
}

/** Group accepts an order: positions set, rounds scheduled, circle ACTIVE. */
export async function acceptOrderAndStart(circleId: string, actorMemberId: string, order?: string[]) {
  const db = getDb();
  const proposal = await proposeOrder(circleId);
  const finalOrder = order ?? proposal.order.map((o) => o.membershipId);
  await db.transaction(async (tx) => {
    const at = await now(tx);
    const [c] = await tx.select().from(s.circles).where(eq(s.circles.id, circleId)).for("update");
    if (!c) throw new EngineError("NOT_FOUND", "circle not found");
    if (c.createdBy !== actorMemberId) throw new EngineError("FORBIDDEN", "only the organiser can start the circle");
    const ms = await tx.select({ m: s.memberships, score: s.members.circleScore }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, circleId));
    if (ms.length !== c.size) throw new EngineError("CONFLICT", `circle needs ${c.size} members, has ${ms.length}`);
    if (ms.some((x) => x.m.status !== "ACTIVE")) throw new EngineError("CONFLICT", "everyone must approve automatic contributions first");
    const ids = new Set(ms.map((x) => x.m.id));
    if (finalOrder.length !== c.size || new Set(finalOrder).size !== c.size || finalOrder.some((id) => !ids.has(id))) throw new EngineError("INVALID", "order must list every member once");

    const scores = Object.fromEntries(ms.map((x) => [x.m.id, x.score]));
    let tier: ProtectionTier = c.protectionTier;
    if (needsPlusTier(finalOrder, scores) && tier !== "PLUS") {
      await appendLedger(tx, circleId, { type: "TIER_RAISED", from: tier, to: "PLUS", reason: "a Newcomer collects in the first half" }, memberActor(actorMemberId), at);
      tier = "PLUS";
    }
    const isManual = order !== undefined && order.join() !== proposal.order.map((o) => o.membershipId).join();
    await appendLedger(tx, circleId, { type: "ORDER_SET", order: finalOrder, seed: proposal.seed, mode: isManual ? "MANUAL" : "SMART" }, memberActor(actorMemberId), at);
    for (const [i, id] of finalOrder.entries()) await tx.update(s.memberships).set({ position: i + 1, updatedAt: new Date() }).where(eq(s.memberships.id, id));

    const period = PERIOD_MS[c.frequency];
    const start = at.getTime() + 60_000;
    for (let i = 0; i < c.size; i++) {
      const due = new Date(start + i * period);
      const graceEnds = new Date(due.getTime() + c.graceHours * 3_600_000);
      await tx.insert(s.rounds).values({ id: uuidv7(), circleId, seq: i + 1, collectionDueAt: due, graceEndsAt: graceEnds, payoutDueAt: graceEnds, recipientMembershipId: finalOrder[i]!, status: "SCHEDULED" });
    }
    await tx.update(s.circles).set({ status: transitionCircle(c.status, "ACTIVE"), protectionTier: tier, orderMode: isManual ? "MANUAL" : "SMART", orderSeed: proposal.seed, startsAt: new Date(start), updatedAt: new Date() }).where(eq(s.circles.id, circleId));
  });
  await publish(circleId, "circle.updated");
}
