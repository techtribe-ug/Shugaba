import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { LiveRefresh } from "@/components/live";
import { Pebble } from "@/components/pebble";
import { BackBar, btnPrimary } from "@/components/ui/top-bar";
import { TabBar } from "@/components/ui/tab-bar";
import { currentMember } from "@/lib/auth/session";
import { formatCents } from "@/lib/protocol";
import { moneyView, type MoneyRow } from "@/lib/views/money";
import { whatsAppLive } from "@/lib/notify/channels";
import { WaAlertsTeaser } from "@/components/whatsapp";
import { payNow } from "./actions";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const STATUS: Record<MoneyRow["status"], { color: string; icon: "check" | "x" | "shield" | "out" | "in" | "clock" }> = {
  paid: { color: "var(--paid)", icon: "check" },
  late: { color: "var(--grace)", icon: "check" },
  failed: { color: "var(--failed)", icon: "x" },
  covered: { color: "var(--accent)", icon: "shield" },
  recovered: { color: "var(--paid)", icon: "check" },
  received: { color: "var(--paid)", icon: "in" },
  sending: { color: "var(--accent)", icon: "clock" },
  open: { color: "var(--grace)", icon: "shield" },
  partial: { color: "var(--grace)", icon: "shield" },
};

/** My money: what I owe next, my turn, and every payment in and out with its PayPal reference. */
export default async function Money({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string; error?: string; cancelled?: string }> }) {
  const { id } = await params;
  const { paid, error, cancelled } = await searchParams;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/money`);
  const v = await moneyView(id, me.id);
  if (!v) notFound();
  const pay = (what: Parameters<typeof payNow>[1]) => payNow.bind(null, id, what);
  const paypal = <span className="font-extrabold italic">PayPal</span>;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <LiveRefresh circleId={id} />
      <BackBar href={`/c/${id}`} title="My money" />
      <main className="flex flex-1 flex-col gap-6 px-5 pt-2 pb-8 rise">
        {paid ? (
          <p role="status" className="flex items-center gap-2.5 rounded-[14px] bg-[#ECFDF3] px-4 py-3 text-[15px] font-bold text-[#166534]">
            <Icon name="check" size={18} stroke={2.6} color="#16A34A" /> Paid with {paypal}. It&apos;s on the ledger.
          </p>
        ) : null}
        {error ? <p role="alert" className="rounded-[14px] bg-[#FEF2F2] px-4 py-3 text-[15px] font-bold text-failed">{error}</p> : null}
        {cancelled ? <p role="status" className="rounded-[14px] bg-surface px-4 py-3 text-[15px]">PayPal was closed. Nothing was charged.</p> : null}

        {/* What's due */}
        <section aria-label="What's due" className="rounded-[20px] border border-line p-5">
          {v.due.kind === "catchup" ? (
            <>
              <span className="text-[13px] font-bold text-failed">Round {v.due.round} didn&apos;t go through</span>
              <span className="num mt-1 block text-[40px] font-extrabold leading-none tracking-tight">{formatCents(v.due.amount)}</span>
              <span className="mt-1.5 block text-[15px] text-muted">Pay by {day(v.due.until)} and it counts as on time in grace. After that the pool covers you and you pay it back.</span>
              <form action={pay("catchup")} className="mt-4"><button className={`${btnPrimary} w-full`}>Pay {formatCents(v.due.amount)} with {paypal}</button></form>
            </>
          ) : v.due.kind === "recovery" ? (
            <>
              <span className="text-[13px] font-bold text-accent">The pool covered you</span>
              <span className="num mt-1 block text-[40px] font-extrabold leading-none tracking-tight">{formatCents(v.due.due - v.due.paid)}</span>
              <span className="mt-1.5 block text-[15px] text-muted">to pay back{v.due.paid ? ` (${formatCents(v.due.paid)} paid so far)` : ""}. No interest. Your score recovers as you pay.</span>
              <div className="mt-4 flex flex-col gap-2">
                {v.due.paid === 0 ? <form action={pay("recovery_half")}><button className={`${btnPrimary} w-full`}>Pay half now with {paypal}</button></form> : null}
                <form action={pay("recovery_rest")}><button className={`h-13 w-full rounded-[14px] border border-line text-base font-bold ${v.due.paid ? "bg-text text-white" : ""}`}>Pay all {formatCents(v.due.due - v.due.paid)}</button></form>
              </div>
            </>
          ) : v.due.kind === "next" ? (
            <>
              <span className="text-[13px] font-bold text-muted">Round {v.due.round} · {day(v.due.on)}</span>
              <span className="num mt-1 block text-[40px] font-extrabold leading-none tracking-tight">{formatCents(v.due.amount)}</span>
              <span className="mt-1.5 block text-[15px] text-muted">{formatCents(v.due.contribution)} contribution + {formatCents(v.due.fee)} protection fee.</span>
              {v.due.paidEarly ? (
                <p className="mt-4 flex items-center gap-2 text-[15px] font-bold text-[#166534]"><Icon name="check" size={18} stroke={2.6} color="#16A34A" /> Paid early. Nothing more to do this round.</p>
              ) : (
                <>
                  <p className="mt-3 flex items-center gap-2 text-[14px] text-muted">
                    <Icon name="shield" size={16} color="var(--paid)" />
                    {v.due.autopay ? <>Paid automatically from your {paypal} on {day(v.due.on)}.</> : <>Connect {paypal} so it&apos;s paid automatically.</>}
                  </p>
                  <form action={pay("early")} className="mt-4"><button className={`${btnPrimary} w-full`}>Pay now with {paypal}</button></form>
                </>
              )}
            </>
          ) : v.due.kind === "forming" ? (
            <span className="text-[15px] text-muted">The circle hasn&apos;t started yet. Nothing is due.</span>
          ) : (
            <div className="flex items-center gap-3"><Pebble size={40} state="pleased" /><span className="text-[15px] font-bold">All paid. Every turn in {v.circle.name} is done.</span></div>
          )}
        </section>

        {/* My turn */}
        {v.turn ? (
          <Link href={v.turn.status === "upcoming" ? `/c/${id}/calendar` : `/c/${id}/payout/${v.turn.roundId}`} className="flex items-center gap-4 rounded-[20px] bg-surface p-5 text-text no-underline">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paid"><Icon name="in" size={20} stroke={2.6} color="#fff" /></span>
            <span className="flex flex-1 flex-col">
              <span className="text-[13px] font-bold text-muted">{v.turn.status === "received" ? "Your payout" : v.turn.status === "sending" ? "Your payout is on its way" : `Your turn · round ${v.turn.round}`}</span>
              <span className="num text-[24px] font-extrabold leading-tight">{formatCents(v.turn.amount)}</span>
              <span className="text-[14px] text-muted">{v.turn.status === "received" ? "In your PayPal." : `${day(v.turn.on)}, straight to your PayPal.`}</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        ) : null}

        {/* Totals */}
        <section aria-label="Totals" className="grid grid-cols-3 gap-3">
          {[
            { label: "Paid in", value: v.totals.paidIn },
            { label: "Received", value: v.totals.received },
            { label: "Owed", value: v.totals.owed },
          ].map((t) => (
            <div key={t.label} className="flex flex-col gap-0.5">
              <span className="num text-[22px] font-bold tracking-tight">{formatCents(t.value)}</span>
              <span className="text-[13px] text-muted">{t.label}</span>
            </div>
          ))}
        </section>
        {v.totals.fees ? <p className="-mt-3 text-[13px] text-muted">Includes {formatCents(v.totals.fees)} in protection fees: they keep every payout full.</p> : null}

        {/* History */}
        <section aria-label="History">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">History</h2>
          {v.rows.length ? (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {v.rows.map((r, i) => {
                const st = STATUS[r.status];
                const body = (
                  <>
                    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: st.color }}>
                      <Icon name={st.icon} size={16} stroke={2.6} color="#fff" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-bold">{r.title}</span>
                      <span className="truncate text-[13px] text-muted">
                        {r.detail} · {day(r.at)}
                        {r.ref ? <> · <span className="font-mono">{r.ref}</span></> : null}
                      </span>
                    </span>
                    <span className={`num shrink-0 text-[16px] font-bold ${r.sign === "in" ? "text-paid" : r.sign === "none" ? "text-muted" : ""}`}>
                      {r.sign === "in" ? "+" : r.sign === "out" ? "−" : ""}{formatCents(r.amount)}
                    </span>
                  </>
                );
                return (
                  <li key={i}>
                    {r.href ? <Link href={r.href} className="flex items-center gap-3 py-3.5 text-text no-underline">{body}</Link> : <div className="flex items-center gap-3 py-3.5">{body}</div>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-[15px] text-muted">No payments yet. They&apos;ll show here with their PayPal reference.</p>
          )}
        </section>
        <Link href={`/c/${id}/ledger`} className="text-center text-[15px] font-bold text-accent">See the whole circle&apos;s ledger</Link>
        {whatsAppLive() ? null : <WaAlertsTeaser />}
      </main>
      <TabBar circleId={id} active="money" />
    </div>
  );
}
