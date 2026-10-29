import { and, asc, eq, inArray } from "drizzle-orm";
import { AgentPrefs } from "@/lib/protocol";
import { negotiate, type Rationale } from "@/lib/agents/market";
import { db as getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getMockProvider } from "@/lib/paypal";
import { acceptOrderAndStart, appendTranscript, applyRecoveryPayment, joinCircle, markAgreed, moveClockTo, now, openSwapRequest, runDue, signTrade, startMandate } from "@/lib/engine";
import { CAST, castId, FAMILY_CIRCLE_ID, FAMILY_INVITE, type CastMember } from "./cast";

export const GOLDEN_STEPS = [
  "Create",
  "Join",
  "Order",
  "Collect",
  "Pay out",
  "Default",
  "Protect",
  "Trade a turn",
  "Recover",
  "Complete",
  "Operate",
] as const;

async function membershipOf(key: CastMember["key"]) {
  const [m] = await getDb().select().from(s.memberships).where(and(eq(s.memberships.circleId, FAMILY_CIRCLE_ID), eq(s.memberships.memberId, castId(key))));
  return m ?? null;
}

/** Where the demo is now, read from the database (so it survives restarts and works across tabs). */
export async function goldenState() {
  const db = getDb();
  const [circle] = await db.select().from(s.circles).where(eq(s.circles.id, FAMILY_CIRCLE_ID));
  if (!circle) return { step: 0, circle: null };
  const ms = await db.select().from(s.memberships).where(eq(s.memberships.circleId, FAMILY_CIRCLE_ID));
  const rounds = await db.select().from(s.rounds).where(eq(s.rounds.circleId, FAMILY_CIRCLE_ID)).orderBy(asc(s.rounds.seq));
  const recoveries = ms.length ? await db.select().from(s.recoveries).where(inArray(s.recoveries.membershipId, ms.map((m) => m.id))) : [];
  const trades = await db.select().from(s.turnTrades).where(eq(s.turnTrades.circleId, FAMILY_CIRCLE_ID));
  const paidOut = rounds.filter((r) => r.status === "PAID_OUT").length;
  const r1 = rounds[0];
  const r2 = rounds[1];
  let step = 1; // Create done (seeded)
  if (ms.length === circle.size && ms.every((m) => m.status === "ACTIVE")) step = 2;
  if (circle.status !== "FORMING") step = 3;
  if (r1 && r1.status !== "SCHEDULED") step = 4;
  if (r1?.status === "PAID_OUT") step = 5;
  if (r2 && (r2.status === "GRACE" || r2.status === "SETTLING")) step = 6;
  if (r2?.status === "PAID_OUT" && recoveries.length) step = 7;
  if (trades.some((t) => t.status === "CONFIRMED" || t.status === "SETTLED")) step = Math.max(step, 8);
  if (recoveries.length && recoveries.every((r) => r.status === "PAID")) step = Math.max(step, 9);
  if (circle.status === "COMPLETED") step = 10;
  return { step, circle, rounds, paidOut, recoveries, trades, memberships: ms };
}

/** Steps 2 and 3: everyone else joins and approves; the organiser accepts the smart order. */
export async function joinEveryone() {
  const amina = await membershipOf("amina");
  if (amina && amina.status !== "ACTIVE") await startMandate(amina.id);
  for (const c of CAST.slice(1)) await joinCircle(castId(c.key), FAMILY_INVITE, { prefs: c.prefs });
}

export async function startWithSmartOrder() {
  await acceptOrderAndStart(FAMILY_CIRCLE_ID, castId("amina"));
}

/** Moves the demo clock to the next thing that is due and runs it. */
export async function advanceToNextDue(): Promise<string> {
  const db = getDb();
  const rounds = await db.select().from(s.rounds).where(eq(s.rounds.circleId, FAMILY_CIRCLE_ID)).orderBy(asc(s.rounds.seq));
  const next = rounds.find((r) => r.status !== "PAID_OUT");
  if (!next) return "nothing left";
  const target = next.status === "SCHEDULED" ? next.collectionDueAt : next.payoutDueAt;
  const at = await now(db);
  if (target > at) await moveClockTo(db, new Date(target.getTime() + 1000));
  await runDue();
  return next.status === "SCHEDULED" ? `collected round ${next.seq}` : `settled round ${next.seq}`;
}

/** The single "Advance to next step" button. */
export async function advanceGolden(): Promise<string> {
  const st = await goldenState();
  if (!st.circle) throw new Error("run Reset demo first");
  if (st.step < 2) {
    await joinEveryone();
    return "everyone joined";
  }
  if (st.circle.status === "FORMING") {
    await startWithSmartOrder();
    return "order accepted";
  }
  // Before round 2 is collected, line up Musa's failure so the story happens without extra clicks.
  const r2 = st.rounds?.[1];
  if (r2?.status === "SCHEDULED" && st.rounds?.[0]?.status === "PAID_OUT") await failMusaNext();
  // After round 2 is paid out, run the swap before round 3.
  if (r2?.status === "PAID_OUT" && !st.trades?.length) {
    await runTundeSwap({ autoConfirm: true });
    return "Tunde and Ifeoma swapped turns";
  }
  // After the swap, Musa clears his invoice in two parts.
  const open = st.recoveries?.find((r) => r.status === "OPEN" || r.status === "PARTIAL");
  if (st.trades?.length && open) {
    const part = open.status === "OPEN" ? 1 : 2;
    await payMusaInvoice(part);
    return part === 1 ? "Musa paid half his invoice" : "Musa paid the rest; the pool is whole again";
  }
  return advanceToNextDue();
}

export async function failMusaNext() {
  const mock = getMockProvider();
  const m = await membershipOf("musa");
  if (!mock || !m) throw new Error("only in mock mode, after Musa joined");
  mock.forceFail(m.id);
}

/** Step 8: Tunde's agent asks; other agents answer inside their prefs; both humans sign. */
export async function runTundeSwap(opts: { autoConfirm?: boolean; rationale?: Rationale } = {}) {
  const db = getDb();
  const tunde = await membershipOf("tunde");
  if (!tunde) throw new Error("Tunde is not in the circle");
  const trade = await openSwapRequest(FAMILY_CIRCLE_ID, tunde.id, "School fees are due this month");
  const rounds = await db.select().from(s.rounds).where(eq(s.rounds.circleId, FAMILY_CIRCLE_ID));
  const ms = await db.select({ m: s.memberships, member: s.members }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, FAMILY_CIRCLE_ID));
  const turnOf = (id: string) => rounds.find((r) => r.recipientMembershipId === id)!;
  const toMarket = (x: (typeof ms)[number]) => ({ membershipId: x.m.id, name: x.member.name, turnSeq: turnOf(x.m.id).seq, collected: turnOf(x.m.id).status === "PAID_OUT", prefs: AgentPrefs.parse(x.m.agentPrefsJson ?? {}) });
  const me = ms.find((x) => x.m.id === tunde.id)!;
  const { transcript, terms } = await negotiate({ requester: toMarket(me), others: ms.filter((x) => x.m.id !== tunde.id).map(toMarket), pot: 30000, reason: "School fees are due this month", rationale: opts.rationale });
  await appendTranscript(trade.id, transcript.slice(1));
  if (!terms) return { tradeId: trade.id, agreed: false };
  const v = await markAgreed(trade.id, terms);
  if (!v.ok || !opts.autoConfirm) return { tradeId: trade.id, agreed: v.ok };
  await signTrade(trade.id, castId("tunde"));
  await signTrade(trade.id, castId("ifeoma"));
  return { tradeId: trade.id, agreed: true };
}

/** Step 9: Musa pays his invoice in two parts. */
export async function payMusaInvoice(part: 1 | 2) {
  const db = getDb();
  const m = await membershipOf("musa");
  if (!m) throw new Error("Musa is not in the circle");
  const [rec] = await db.select().from(s.recoveries).where(and(eq(s.recoveries.membershipId, m.id), inArray(s.recoveries.status, ["OPEN", "PARTIAL"])));
  if (!rec) return "nothing owed";
  const half = Math.ceil(rec.amountDue / 2);
  const amount = part === 1 ? half : rec.amountDue - rec.amountPaid;
  await applyRecoveryPayment(rec.id, amount, `demo-${rec.id}-part${part}`);
  return `Musa paid part ${part}`;
}
