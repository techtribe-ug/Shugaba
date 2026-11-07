import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "@/components/live";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { formatCents, levelFor } from "@/lib/protocol";
import { isMember } from "@/lib/views/circle";
import { tradeView } from "@/lib/views/trade";
import { SignTrade } from "./sign";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "–");

/** Swap confirm card (design: GSwap) with the agents' negotiation underneath. */
export default async function Trade({ params }: { params: Promise<{ id: string; tradeId: string }> }) {
  const { id, tradeId } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/trades/${tradeId}`);
  if (!(await isMember(id, me.id))) notFound();
  const v = await tradeView(tradeId);
  if (!v || v.trade.circleId !== id) notFound();
  const from = v.parties.find((p) => p.id === v.trade.fromMembership);
  const to = v.parties.find((p) => p.id === v.trade.toMembership);
  const mine = v.parties.find((p) => p.memberId === me.id);
  const bonus = v.trade.bonusAmount;
  // The requester moves early and pays the bonus out of that payout; the other member moves later and gets it.
  const rows = [
    { p: from, was: v.fromDate, now: v.toDate, amount: v.pot - bonus, color: "var(--text)" },
    { p: to, was: v.toDate, now: v.fromDate, amount: v.pot + bonus, color: "var(--paid)" },
  ];
  const status = v.trade.status;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <LiveRefresh circleId={id} />
      <BackBar href={`/c/${id}`} title="Swap turns" />
      <main className="flex flex-1 flex-col px-5 pt-2 pb-6 rise">
        {to ? (
          <>
            {rows.map((r, i) => (
              <div key={r.p?.id ?? i}>
                {i === 1 ? (
                  <div aria-hidden className="relative -my-1.5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line"><Icon name="swap" size={18} /></span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                ) : null}
                <section className="flex items-center gap-3.5 px-1 py-[22px]">
                  <Avatar size={52} levelColor={levelFor(r.p?.score ?? 550).color} />
                  <div className="flex flex-1 flex-col gap-[3px]">
                    <span className="flex items-baseline gap-2">
                      <span className="text-base font-extrabold">{r.p?.memberId === me.id ? "You" : r.p?.name}</span>
                      <span className="num text-[13px] font-bold" style={{ color: levelFor(r.p?.score ?? 550).color }}>{levelFor(r.p?.score ?? 550).title}</span>
                    </span>
                    <span className="num text-sm text-muted"><s>{day(r.was)}</s> · now {day(r.now)}</span>
                  </div>
                  <span className="num text-2xl font-bold" style={{ color: r.color }}>{formatCents(r.amount)}</span>
                </section>
              </div>
            ))}
            <section aria-label="Bonus" className="flex flex-col border-t border-line pt-1.5">
              <div className="flex items-baseline justify-between px-1 py-3">
                <span className="text-[15px] text-[#52525B]">Bonus to {to.memberId === me.id ? "you" : to.name}</span>
                <span className="num text-xl font-bold">{formatCents(bonus)}</span>
              </div>
              <div className="flex items-center gap-2.5 border-t border-surface px-1 py-3">
                <span aria-hidden className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-accent"><Icon name="shield" size={12} stroke={2.6} color="#fff" /></span>
                <span className="text-sm leading-snug text-[#52525B]">Taken from {from?.memberId === me.id ? "your" : `${from?.name}'s`} early payout and held in the pool. Added to {to.memberId === me.id ? "yours" : `${to.name}'s`} on {day(v.fromDate)}.</span>
              </div>
            </section>
          </>
        ) : (
          <p className="py-8 text-[17px] text-muted">{v.from}&apos;s agent is asking around for an earlier turn.</p>
        )}

        {v.transcript.length ? (
          <details className="mt-6 border-t border-line pt-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-bold">How the agents agreed</summary>
            <ol className="flex flex-col gap-3 pt-2 pb-2">
              {v.transcript.map((e) => (
                <li key={e.i} className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-muted">{e.speaker}&apos;s agent · {e.msg.kind.toLowerCase()}</span>
                  <span className="text-[15px]">
                    {"rationale" in e.msg ? e.msg.rationale : "reason" in e.msg ? e.msg.reason : "Agreed."}
                    {"bonus" in e.msg && e.msg.bonus ? <span className="num font-bold"> · {formatCents(e.msg.bonus)}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <div className="mt-auto flex flex-col gap-1 pt-8">
          {status === "AGREED" && mine ? (
            mine.signed ? (
              <p className="py-4 text-center text-[15px] text-muted">You signed. Waiting for {v.parties.find((p) => p.id !== mine.id)?.name}.</p>
            ) : (
              <SignTrade tradeId={tradeId} circleId={id} />
            )
          ) : status === "CONFIRMED" || status === "SETTLED" ? (
            <p role="status" className="flex items-center justify-center gap-2 py-4 text-[17px] font-extrabold text-paid"><Icon name="check" stroke={3} /> Swap confirmed</p>
          ) : status === "REJECTED" || status === "EXPIRED" ? (
            <p className="py-4 text-center text-[15px] text-muted">This swap did not go through.</p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
