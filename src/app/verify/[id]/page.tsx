import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { LedgerList } from "@/components/ledger-list";
import { BrandBar } from "@/components/ui/top-bar";
import { VerifyChain } from "@/components/verify-chain";
import { formatCents } from "@/lib/protocol";
import { ledgerView } from "@/lib/views/ledger";

export const dynamic = "force-dynamic";

/** Public ledger (design: GVerify). Initials only, no PayPal references. */
export default async function Verify({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await ledgerView(id, "public");
  if (!v) notFound();
  const totals = [
    { value: v.totals.paidIn, label: "paid in", bg: "var(--paid)", fg: "var(--text)", icon: "in" as const },
    { value: v.totals.paidOut, label: "paid out", bg: "var(--text)", fg: "var(--text)", icon: "out" as const },
    { value: v.totals.covered, label: "covered by the pool", bg: "var(--accent)", fg: "var(--accent)", icon: "shield" as const },
  ];
  return (
    <main className="mx-auto max-w-[880px] px-4 py-11 sm:px-6 rise">
      <BrandBar label={`${v.circle.name} · public ledger`} />
      <h1 className="num text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">Every dollar, on the record.</h1>
      <p className="mt-3 text-[17px] text-muted">Anyone can check it. Names show as initials.</p>
      <section aria-label="Totals" className="mt-9 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {totals.map((t) => (
          <div key={t.label} className="flex flex-col gap-1.5">
            <span className="num text-[34px] font-bold leading-none tracking-tight" style={{ color: t.fg }}>{formatCents(t.value)}</span>
            <span className="flex items-center gap-2 text-sm text-muted">
              <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: t.bg }}><Icon name={t.icon} size={12} stroke={2.6} color="#fff" /></span>
              {t.label}
            </span>
          </div>
        ))}
      </section>
      <div className="mt-9">
        <VerifyChain events={v.chain} />
      </div>
      <div className="mt-6">
        <LedgerList rows={v.rows} />
      </div>
    </main>
  );
}
