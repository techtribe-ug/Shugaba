import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Pebble } from "@/components/pebble";
import { currentMember } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { isMember } from "@/lib/views/circle";

export const dynamic = "force-dynamic";

const usd = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

/** Payout received (design: GPayout). The recipient sees "is in your PayPal"; everyone else sees who was paid. */
export default async function PayoutReceived({ params }: { params: Promise<{ id: string; roundId: string }> }) {
  const { id, roundId } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/payout/${roundId}`);
  if (!(await isMember(id, me.id))) notFound();

  const d = db();
  const [round] = await d.select().from(s.rounds).where(and(eq(s.rounds.id, roundId), eq(s.rounds.circleId, id)));
  if (!round || !round.recipientMembershipId) notFound();
  const [payout] = await d.select().from(s.payouts).where(eq(s.payouts.roundId, roundId));
  const [recipient] = await d
    .select({ memberId: s.members.id, name: s.members.name })
    .from(s.memberships)
    .innerJoin(s.members, eq(s.members.id, s.memberships.memberId))
    .where(eq(s.memberships.id, round.recipientMembershipId));
  const contribs = await d
    .select({ status: s.contributions.status, name: s.members.name })
    .from(s.contributions)
    .innerJoin(s.memberships, eq(s.memberships.id, s.contributions.membershipId))
    .innerJoin(s.members, eq(s.members.id, s.memberships.memberId))
    .where(eq(s.contributions.roundId, roundId));

  const paid = contribs.filter((c) => c.status === "PAID" || c.status === "RECOVERED");
  const covered = contribs.filter((c) => c.status === "COVERED");
  const mine = recipient?.memberId === me.id;
  const done = payout?.status === "SUCCEEDED" || round.status === "PAID_OUT";
  const amount = payout?.amount ?? 0;

  let from = `From ${paid.length} member${paid.length === 1 ? "" : "s"}`;
  if (covered.length) from += ` and the pool, which covered ${covered.map((c) => c.name).join(" and ")}`;
  from += ".";

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-[560px] flex-col overflow-hidden">
      {done ? <Leaves /> : null}
      <main className="flex flex-1 flex-col items-center px-6 pt-28 pb-7 text-center">
        <Pebble size={96} state={done ? "pleased" : "watching"} />
        {done ? (
          <>
            <span className="num rise mt-8 text-[84px] leading-none font-bold tracking-[-3px] text-paid">{usd(amount)}</span>
            <span className="rise mt-2.5 text-[19px] font-bold">
              {mine ? (
                <>is in your <span className="font-extrabold italic">PayPal</span>, {recipient!.name}.</>
              ) : (
                <>went to {recipient!.name}&apos;s <span className="font-extrabold italic">PayPal</span>.</>
              )}
            </span>
            <div className="rise mt-7 flex flex-col items-center gap-2.5">
              <div className="flex items-center">
                {paid.map((c, i) => (
                  <span key={i} className="rounded-full shadow-[0_0_0_2.5px_#fff]" style={{ marginLeft: i ? -8 : 0 }}>
                    <Avatar size={30} state="due" />
                  </span>
                ))}
                {covered.length ? (
                  <span aria-hidden className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent shadow-[0_0_0_2.5px_#fff]" style={{ marginLeft: -8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></svg>
                  </span>
                ) : null}
              </div>
              <span className="text-[15px] text-muted">{from}</span>
              <span className="text-[13px] text-muted">Round {round.seq}. Full pot, paid on time.</span>
            </div>
          </>
        ) : (
          <>
            <span className="rise mt-8 text-[22px] font-bold">Round {round.seq} payout is on its way to {recipient?.name ?? "the recipient"}.</span>
            <span className="rise mt-2 text-[15px] text-muted">PayPal is still processing it. This page updates when it lands.</span>
          </>
        )}
        <div className="mt-auto flex w-full flex-col gap-1 pt-10">
          <Link href={`/c/${id}`} className="flex h-14 items-center justify-center rounded-[14px] bg-text text-base font-extrabold text-white no-underline">Done</Link>
          <Link href={`/c/${id}/ledger`} className="flex h-13 items-center justify-center text-[15px] font-bold text-muted no-underline">See it on the ledger</Link>
        </div>
      </main>
    </div>
  );
}

const BLOB = "M-27 -6 C-27 -26 -4 -31 10 -27 C27 -23 31 -6 28 9 C25 25 6 31 -8 29 C-23 27 -27 13 -27 -6 Z";

/** Small pebble-shaped leaves drifting down once. Calm, not confetti; off under reduced motion. */
function Leaves() {
  const leaves = [
    { left: "10%", size: 14, delay: "0s", color: "#16A34A" },
    { left: "23%", size: 10, delay: ".8s", color: "#3B358A" },
    { left: "38%", size: 16, delay: "1.6s", color: "#16A34A" },
    { left: "50%", size: 9, delay: "2.3s", color: "#D29A1E" },
    { left: "60%", size: 12, delay: ".4s", color: "#D29A1E" },
    { left: "75%", size: 14, delay: "1.2s", color: "#16A34A" },
    { left: "86%", size: 10, delay: "2s", color: "#3B358A" },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80">
      <style>{`@keyframes leaf-fall{0%{transform:translateY(-40px) rotate(0);opacity:0}15%{opacity:1}100%{transform:translateY(260px) rotate(200deg);opacity:0}}.leaf{position:absolute;top:40px;animation:leaf-fall 2.6s ease-in 2 both}@media (prefers-reduced-motion: reduce){.leaf{display:none}}`}</style>
      {leaves.map((l, i) => (
        <svg key={i} className="leaf" width={l.size} height={l.size} viewBox="-50 -50 100 100" style={{ left: l.left, animationDelay: l.delay }}>
          <path d={BLOB} fill={l.color} />
        </svg>
      ))}
    </div>
  );
}
