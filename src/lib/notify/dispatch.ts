import { and, asc, desc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import { db as getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";
import { formatCents } from "@/lib/protocol";
import { getChannel, type Template } from "./channels";

const g = globalThis as unknown as { __shugabaNotifySeq?: number };
const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

type Notice = { memberId: string; template: Template; params: string[]; ledgerSeq: number | null };

/** Sends one notice if the member opted in to WhatsApp. Deduped by (member, template, ledger seq). Never throws. */
export async function sendNotice(n: Notice) {
  const db = getDb();
  try {
    const [ch] = await db.select().from(s.notificationChannels).where(and(eq(s.notificationChannels.memberId, n.memberId), eq(s.notificationChannels.channel, "whatsapp"), isNotNull(s.notificationChannels.optedInAt), isNull(s.notificationChannels.optedOutAt)));
    if (!ch?.phoneE164) return;
    const id = uuidv7();
    const inserted = await db.insert(s.outboundMessages).values({ id, memberId: n.memberId, channel: "whatsapp", template: n.template, paramsJson: n.params, ledgerSeq: n.ledgerSeq }).onConflictDoNothing().returning({ id: s.outboundMessages.id });
    if (!inserted.length) return;
    const [m] = await db.select({ language: s.members.language }).from(s.members).where(eq(s.members.id, n.memberId));
    const res = await getChannel().send(ch.phoneE164, n.template, n.params, m?.language === "ha" ? "ha" : "en");
    await db.update(s.outboundMessages).set(res.ok ? { status: "SENT", providerMessageId: res.providerMessageId, updatedAt: new Date() } : { status: "FAILED", error: res.error.slice(0, 300), updatedAt: new Date() }).where(eq(s.outboundMessages.id, id));
  } catch (e) {
    // Errors never block the money flow (spec 10.9).
    console.error("[notify]", e);
  }
}

/**
 * Worker step: turns new ledger events into WhatsApp notices (payment failed, payout sent).
 * Amounts and first names only; every notice is a link back into the app.
 */
export async function dispatchNotifications() {
  const db = getDb();
  if (g.__shugabaNotifySeq === undefined) {
    // First run after a restart: look back over the last 200 events only; the unique index stops repeats.
    const [max] = await db.select({ seq: s.ledgerEvents.seq }).from(s.ledgerEvents).orderBy(desc(s.ledgerEvents.seq)).limit(1);
    g.__shugabaNotifySeq = Math.max(0, (max?.seq ?? 0) - 200);
  }
  const events = await db.select().from(s.ledgerEvents).where(and(gt(s.ledgerEvents.seq, g.__shugabaNotifySeq), inArray(s.ledgerEvents.type, ["CONTRIBUTION_FAILED", "CONTRIBUTION_PAID", "PAYOUT_CONFIRMED"]))).orderBy(asc(s.ledgerEvents.seq)).limit(200);
  for (const e of events) {
    const p = e.payloadJson as Record<string, unknown>;
    if (e.type === "CONTRIBUTION_FAILED") {
      const [row] = await db.select({ memberId: s.memberships.memberId, circle: s.circles.name, circleId: s.circles.id, graceEndsAt: s.rounds.graceEndsAt }).from(s.contributions).innerJoin(s.memberships, eq(s.memberships.id, s.contributions.membershipId)).innerJoin(s.circles, eq(s.circles.id, s.memberships.circleId)).innerJoin(s.rounds, eq(s.rounds.id, s.contributions.roundId)).where(eq(s.contributions.id, String(p.contributionId)));
      if (row) await sendNotice({ memberId: row.memberId, template: "payment_failed", params: [row.circle, day(row.graceEndsAt), `${site()}/c/${row.circleId}/chat`], ledgerSeq: e.seq });
    }
    if (e.type === "CONTRIBUTION_PAID") {
      const [row] = await db.select({ memberId: s.memberships.memberId, circle: s.circles.name, circleId: s.circles.id, amount: s.contributions.amount, fee: s.contributions.feeAmount, seq: s.rounds.seq }).from(s.contributions).innerJoin(s.memberships, eq(s.memberships.id, s.contributions.membershipId)).innerJoin(s.circles, eq(s.circles.id, s.memberships.circleId)).innerJoin(s.rounds, eq(s.rounds.id, s.contributions.roundId)).where(eq(s.contributions.id, String(p.contributionId)));
      if (row) await sendNotice({ memberId: row.memberId, template: "payment_received", params: [formatCents(row.amount + row.fee), row.circle, String(row.seq), `${site()}/c/${row.circleId}/money`], ledgerSeq: e.seq });
    }
    if (e.type === "PAYOUT_CONFIRMED") {
      const [row] = await db.select({ memberId: s.memberships.memberId, amount: s.payouts.amount, circle: s.circles.name }).from(s.payouts).innerJoin(s.rounds, eq(s.rounds.id, s.payouts.roundId)).innerJoin(s.memberships, eq(s.memberships.id, s.rounds.recipientMembershipId)).innerJoin(s.circles, eq(s.circles.id, s.rounds.circleId)).where(eq(s.payouts.id, String(p.payoutId)));
      if (row) await sendNotice({ memberId: row.memberId, template: "payout_sent", params: [formatCents(row.amount), row.circle], ledgerSeq: e.seq });
    }
    g.__shugabaNotifySeq = e.seq;
  }
}
