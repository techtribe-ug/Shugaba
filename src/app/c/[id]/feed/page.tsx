import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LedgerList } from "@/components/ledger-list";
import { LiveRefresh } from "@/components/live";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { isMember } from "@/lib/views/circle";
import { ledgerView } from "@/lib/views/ledger";

export const dynamic = "force-dynamic";

/** What happened in the circle, newest first, in plain words (design: GFeed). */
export default async function Feed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/feed`);
  if (!(await isMember(id, me.id))) notFound();
  const v = await ledgerView(id, "member");
  if (!v) notFound();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <LiveRefresh circleId={id} />
      <BackBar href={`/c/${id}`} title="What happened" right={<Link href={`/c/${id}/ledger`} className="flex min-h-11 items-center text-[15px] font-bold text-accent">Ledger</Link>} />
      <main className="flex flex-1 flex-col px-4 pt-2 pb-6 rise">
        {v.feedRows.length ? <LedgerList rows={v.feedRows} /> : <p className="py-8 text-center text-[15px] text-muted">Nothing yet.</p>}
      </main>
    </div>
  );
}
