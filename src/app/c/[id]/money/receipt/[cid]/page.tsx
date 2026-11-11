import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { Pebble } from "@/components/pebble";
import { PrintButton } from "@/components/print-button";
import { WaShareLink } from "@/components/whatsapp";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { formatCents } from "@/lib/protocol";
import { receiptView } from "@/lib/views/receipt";

export const dynamic = "force-dynamic";

const when = (d: Date) =>
  d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

const STATUS: Record<string, { label: string; color: string; icon: "check" | "x" | "shield" }> = {
  PAID: { label: "Paid", color: "var(--paid)", icon: "check" },
  LATE: { label: "Paid in grace", color: "var(--grace)", icon: "check" },
  RECOVERED: { label: "Paid back", color: "var(--paid)", icon: "check" },
  FAILED: { label: "Didn't go through", color: "var(--failed)", icon: "x" },
  COVERED: { label: "Covered by the pool", color: "var(--accent)", icon: "shield" },
};

/** Receipt for one contribution, with the PayPal reference and the ledger entry that proves it. */
export default async function Receipt({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/money/receipt/${cid}`);
  const r = await receiptView(id, me.id, cid);
  if (!r) notFound();
  const st = STATUS[r.status] ?? STATUS.PAID!;
  const paid = r.status === "PAID" || r.status === "LATE" || r.status === "RECOVERED";
  const lines: [string, React.ReactNode][] = [
    ["Circle", r.circle],
    ["Round", String(r.round)],
    ["Paid by", <>{r.member.name}{r.member.paypalEmail ? <span className="block text-[13px] text-muted">{r.member.paypalEmail}</span> : null}</>],
    ["Contribution", formatCents(r.amount)],
    ["Protection fee", formatCents(r.fee)],
    ["When", when(r.at)],
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <div className="print:hidden"><BackBar href={`/c/${id}/money`} title="Receipt" /></div>
      <main className="flex flex-1 flex-col gap-6 px-5 pt-2 pb-10 rise">
        <section aria-label="Receipt" className="rounded-[24px] border border-line p-6">
          <div className="flex items-center gap-2">
            <Pebble size={24} />
            <span className="font-display text-lg font-bold leading-none tracking-tight">shugaba</span>
            <span className="flex-1" />
            <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold text-white" style={{ background: st.color }}>
              <Icon name={st.icon} size={14} stroke={2.8} color="#fff" /> {st.label}
            </span>
          </div>
          <span className="num mt-6 block text-[48px] font-extrabold leading-none tracking-tight">{formatCents(r.total)}</span>
          <span className="mt-1.5 block text-[15px] text-muted">
            {paid ? <>Paid with <span className="font-extrabold italic text-text">PayPal</span></> : r.failureReason ?? "No money moved for this round."}
          </span>

          <dl className="mt-6 divide-y divide-line border-y border-line">
            {lines.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-3 text-[15px]">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>

          {r.ref ? (
            <div className="mt-5 flex flex-col gap-1">
              <span className="text-[13px] font-bold uppercase tracking-wide text-muted">PayPal reference</span>
              <span className="font-mono text-[17px] font-bold break-all">{r.ref}</span>
              {r.webhook ? (
                <span className="flex items-center gap-1.5 text-[13px] text-muted">
                  <Icon name="check" size={14} stroke={2.6} color="var(--paid)" />
                  PayPal confirmed it ({r.webhook.type}){r.webhook.verified ? ", signature verified" : ""}
                </span>
              ) : null}
            </div>
          ) : null}

          {r.ledger ? (
            <div className="mt-5 flex flex-col gap-1">
              <span className="text-[13px] font-bold uppercase tracking-wide text-muted">On the circle&apos;s ledger</span>
              <span className="text-[15px]">
                Entry <span className="num font-bold">#{r.ledger.seq}</span> · <span className="font-mono text-[13px] text-muted">{r.ledger.hash.slice(0, 16)}…</span>
              </span>
              <span className="text-[13px] text-muted">Every member can check this entry. It can&apos;t be edited without breaking the chain.</span>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col gap-3 print:hidden">
          {paid ? (
            <WaShareLink
              label="Share on WhatsApp"
              text={`Shugaba receipt: I paid ${formatCents(r.total)} into ${r.circle}, round ${r.round}.${r.ref ? ` PayPal ref ${r.ref}.` : ""}`}
            />
          ) : null}
          <PrintButton className="inline-flex h-14 w-full items-center justify-center rounded-[14px] border border-line text-base font-bold">Save or print receipt</PrintButton>
          <Link href={`/c/${id}/ledger`} className="text-center text-[15px] font-bold text-accent">See the whole ledger</Link>
          <Link href="/proof" className="text-center text-[15px] font-bold text-muted">Proof of PayPal</Link>
        </div>
      </main>
    </div>
  );
}
