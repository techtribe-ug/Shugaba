import { redirect } from "next/navigation";
import { LedgerList } from "@/components/ledger-list";
import { BackBar } from "@/components/ui/top-bar";
import { TabBar } from "@/components/ui/tab-bar";
import { currentMember } from "@/lib/auth/session";
import { myCircles } from "@/lib/views/circle";
import { ledgerView } from "@/lib/views/ledger";

export const dynamic = "force-dynamic";

/** Latest entries across all of the member's circles (design: GNotify). */
export default async function Notifications() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/notifications");
  const circles = await myCircles(me.id);
  const views = await Promise.all(circles.map((c) => ledgerView(c.id, "member")));
  const rows = views.flatMap((v) => v?.feedRows ?? []).sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 30);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <BackBar href="/home" title="Notifications" />
      <main className="flex flex-1 flex-col px-4 pt-2 pb-6 rise">
        {rows.length ? <LedgerList rows={rows} /> : <p className="py-8 text-center text-[15px] text-muted">Nothing new.</p>}
      </main>
      {circles[0]?.id ? <TabBar circleId={circles[0]!.id} active="circle" /> : null}
    </div>
  );
}
