import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LedgerList } from "@/components/ledger-list";
import { LiveRefresh } from "@/components/live";
import { BackBar } from "@/components/ui/top-bar";
import { VerifyChain } from "@/components/verify-chain";
import { currentMember } from "@/lib/auth/session";
import { isMember } from "@/lib/views/circle";
import { ledgerView } from "@/lib/views/ledger";

export const dynamic = "force-dynamic";

export default async function Ledger({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/ledger`);
  if (!(await isMember(id, me.id))) notFound();
  const v = await ledgerView(id, "member");
  if (!v) notFound();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <LiveRefresh circleId={id} />
      <BackBar href={`/c/${id}`} title="Ledger" />
      <main className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-6 rise">
        <VerifyChain events={v.chain} compact />
        <LedgerList rows={v.rows} />
        <Link href={`/verify/${id}`} className="mt-auto flex min-h-11 items-center self-center text-[15px] font-bold text-accent">Share public link</Link>
      </main>
    </div>
  );
}
