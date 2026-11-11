import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { BrandBar } from "@/components/ui/top-bar";
import { formatCents } from "@/lib/protocol";
import { proofView, type ProofRow } from "@/lib/views/proof";

export const dynamic = "force-dynamic";

const KIND: Record<ProofRow["kind"], { label: string; icon: IconName; bg: string; api: string }> = {
  charge: { label: "Contribution charged", icon: "in", bg: "var(--paid)", api: "Orders v2 · vaulted PayPal" },
  payout: { label: "Payout sent", icon: "out", bg: "var(--text)", api: "Payouts v1" },
  invoice: { label: "Recovery invoice", icon: "shield", bg: "var(--accent)", api: "Invoicing v2" },
};

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** Public: proof that this demo moves money through PayPal (sandbox), with the references PayPal issued. */
export default async function Proof() {
  const v = await proofView();
  const stats = [
    { value: String(v.counts.charges), label: "contributions charged through PayPal" },
    { value: String(v.counts.payouts), label: "payouts confirmed by PayPal" },
    { value: String(v.counts.invoices), label: "recovery invoices issued by PayPal" },
    { value: String(v.counts.webhooks), label: "webhooks, every one signature-verified" },
  ];
  return (
    <main className="mx-auto max-w-[880px] px-4 py-11 sm:px-6 rise">
      <BrandBar label="Proof of PayPal" right={<Link href="/judge" className="text-[15px] font-bold text-accent">Judge panel</Link>} />
      <h1 className="num text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">Real PayPal calls, not a mock-up.</h1>
      <p className="mt-3 max-w-[620px] text-[17px] text-muted">
        {v.sandbox
          ? "This demo runs on the PayPal sandbox: test accounts and test dollars, but every charge, payout, invoice and webhook below went through PayPal's real APIs. The references are the ones PayPal issued."
          : "This deployment is running on Shugaba's built-in mock, so PayPal is not being called right now. The list below shows sandbox activity recorded earlier, if any."}
      </p>

      <section aria-label="Totals" className="mt-9 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5">
            <span className="num text-[34px] font-bold leading-none tracking-tight">{s.value}</span>
            <span className="text-sm text-muted">{s.label}</span>
          </div>
        ))}
      </section>
      <p className="mt-4 text-sm text-muted">
        <span className="num font-bold text-text">{formatCents(v.counts.moved)}</span> moved in and out through PayPal.
        {v.lastWebhookAt ? <> Last verified webhook {when(v.lastWebhookAt)}.</> : null}
      </p>

      {v.webhookTypes.length ? (
        <section aria-label="Webhooks" className="mt-8">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">Webhooks PayPal sent us</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {v.webhookTypes.map(([type, n]) => (
              <li key={type} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13px]">
                <Icon name="check" size={14} stroke={2.6} color="var(--paid)" />
                <span className="font-mono">{type}</span>
                <span className="num font-bold">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="PayPal references" className="mt-10">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">Latest PayPal references</h2>
        {v.rows.length ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {v.rows.map((r) => {
              const k = KIND[r.kind];
              return (
                <li key={`${r.kind}-${r.ref}`} className="flex items-center gap-3 py-3.5">
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: k.bg }}>
                    <Icon name={k.icon} size={16} stroke={2.6} color="#fff" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-bold">
                      {k.label} <span className="font-normal text-muted">· {r.who} · {r.circle}{r.round ? ` round ${r.round}` : ""}</span>
                    </span>
                    <span className="truncate text-[13px] text-muted">
                      <span className="font-mono text-text">{r.ref}</span> · {k.api} · {when(r.at)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[17px] font-bold">{formatCents(r.amount)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-[15px] text-muted">No PayPal activity yet. Run the judge panel and it shows up here.</p>
        )}
      </section>

      <p className="mt-8 text-sm text-muted">
        Want to see the money trail end to end? Open the <Link href="/judge">judge panel</Link>, press Next, and come back: new references appear here as PayPal confirms them.
      </p>
    </main>
  );
}
