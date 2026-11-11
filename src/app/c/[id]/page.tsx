import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "@/components/live";
import { Pebble } from "@/components/pebble";
import { currentMember } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { formatCents } from "@/lib/protocol";
import { circleView } from "@/lib/views/circle";
import { Ring } from "./ring";
import { StartButton } from "./start-button";

export const dynamic = "force-dynamic";

export default async function CircleHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}`);
  const view = await circleView(id, me.id);
  if (!view) notFound();
  if (!view.me) redirect("/home");

  const myTrades = await db()
    .select()
    .from(s.turnTrades)
    .where(and(eq(s.turnTrades.circleId, id), eq(s.turnTrades.status, "AGREED"), or(eq(s.turnTrades.fromMembership, view.me.membershipId), eq(s.turnTrades.toMembership, view.me.membershipId))));
  const toSign = myTrades.filter((t) => !(t.signaturesJson as Record<string, string>)[view.me!.membershipId]);
  const myRecoveries = await db().select().from(s.recoveries).where(and(eq(s.recoveries.membershipId, view.me.membershipId), inArray(s.recoveries.status, ["OPEN", "PARTIAL"])));

  // My most recent payout that has landed: a way back to the "payout received" moment.
  const [myPayout] = await db()
    .select({ roundId: s.rounds.id, amount: s.payouts.amount })
    .from(s.rounds)
    .innerJoin(s.payouts, eq(s.payouts.roundId, s.rounds.id))
    .where(and(eq(s.rounds.circleId, id), eq(s.rounds.recipientMembershipId, view.me.membershipId), eq(s.payouts.status, "SUCCEEDED")))
    .orderBy(desc(s.rounds.seq))
    .limit(1);

  const showAmount = view.current && view.current.status !== "SCHEDULED";
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col">
      <LiveRefresh circleId={id} />
      <header className="flex items-center gap-2 pt-[18px] pr-4 pl-5">
        <Link href="/home" className="flex h-11 items-center gap-1.5 text-lg font-extrabold text-text no-underline">
          {view.circle.name}
        </Link>
        <span className="flex-1" />
        <Link href="/notifications" aria-label="Notifications" className="flex h-11 w-11 items-center justify-center text-text"><Icon name="bell" /></Link>
        <Link href={`/c/${id}/calendar`} aria-label="Calendar" className="flex h-11 w-11 items-center justify-center text-text"><Icon name="calendar" /></Link>
        <Link href={`/c/${id}/feed`} aria-label="Circle feed" className="flex h-11 w-11 items-center justify-center text-text"><Icon name="feed" /></Link>
        <Link href="/settings" aria-label="You" className="flex h-11 w-11 items-center justify-center text-text"><Icon name="user" /></Link>
      </header>

      <main className="flex flex-1 flex-col items-center gap-6 px-6 pt-7 rise">
        <Ring view={view} />
        {showAmount ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="num text-[44px] font-extrabold tracking-tight">{formatCents(view.circle.pot)}</span>
            <span className="text-[15px] text-muted">to {view.current!.recipient}{view.current!.recipient === view.seats.find((x) => x.isMe)?.name ? " (you)" : ""}</span>
          </div>
        ) : view.circle.status === "FORMING" ? (
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-[13px] font-bold text-[#A1A1AA]">Invite code</span>
            <span className="num text-[32px] font-bold tracking-widest">{view.circle.inviteCode}</span>
            <span className="text-sm text-muted">Share /join/{view.circle.inviteCode}</span>
          </div>
        ) : null}

        <Link href={`/c/${id}/chat`} className="max-w-[300px] text-center text-base leading-normal text-[#52525B] no-underline">
          {view.line}
        </Link>

        {myPayout ? (
          <Link href={`/c/${id}/payout/${myPayout.roundId}`} className="flex w-full items-center gap-3 border-y border-line py-3 text-text no-underline">
            <Icon name="shield" color="var(--paid)" />
            <span className="flex-1 text-[15px] font-bold">Your <span className="num">{formatCents(myPayout.amount)}</span> payout landed in PayPal</span>
            <Icon name="chevron" size={18} />
          </Link>
        ) : null}
        {toSign.map((t) => (
          <Link key={t.id} href={`/c/${id}/trades/${t.id}`} className="flex w-full items-center gap-3 border-y border-line py-3 text-text no-underline">
            <Icon name="swap" />
            <span className="flex-1 text-[15px] font-bold">A turn swap needs your confirm</span>
            <Icon name="chevron" size={18} />
          </Link>
        ))}
        {myRecoveries.map((r) => (
          <Link key={r.id} href={`/c/${id}/chat`} className="flex w-full items-center gap-3 border-y border-line py-3 text-text no-underline">
            <Icon name="shield" color="var(--accent)" />
            <span className="flex-1 text-[15px] font-bold">The pool covered you. <span className="num">{formatCents(r.amountDue - r.amountPaid)}</span> to pay back</span>
            <Icon name="chevron" size={18} />
          </Link>
        ))}
        {view.circle.status === "FORMING" && view.circle.isOrganiser ? <StartButton circleId={id} ready={view.seats.length === view.circle.size && view.seats.every((x) => x.status === "ACTIVE")} /> : null}
      </main>

      <footer className="flex items-center gap-2.5 px-4 pt-3.5 pb-6">
        <form action={`/c/${id}/chat`} className="flex flex-1 items-center gap-2.5">
          <label htmlFor="ask" className="sr-only">Ask Shugaba</label>
          <input id="ask" name="q" placeholder="Ask Shugaba" autoComplete="off" className="h-14 min-w-0 flex-1 rounded-full bg-surface px-[22px] text-base outline-none placeholder:text-muted" />
          <button aria-label="Ask" className="flex h-14 w-14 items-center justify-center rounded-full bg-text text-white">
            <Pebble size={30} label="Shugaba" />
          </button>
        </form>
      </footer>
    </div>
  );
}
