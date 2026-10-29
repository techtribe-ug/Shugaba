import { notFound, redirect } from "next/navigation";
import { LiveRefresh } from "@/components/live";
import { PayoutCalendar } from "@/components/payout-calendar";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { calendarView } from "@/lib/views/calendar";
import { isMember } from "@/lib/views/circle";

export const dynamic = "force-dynamic";

/** Payout calendar (design: GCalendar). Updates live on payment, cover and trade. */
export default async function Calendar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/calendar`);
  if (!(await isMember(id, me.id))) notFound();
  const v = await calendarView(id, me.id);
  if (!v) notFound();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[960px] flex-col">
      <LiveRefresh circleId={id} />
      <BackBar href={`/c/${id}`} title="Payout calendar" />
      <main className="flex flex-1 flex-col gap-6 px-4 pt-3 pb-8 rise">
        <header className="flex flex-col gap-1">
          <h1 className="text-[22px] font-extrabold">{v.circle.name}</h1>
          {v.line ? <span className="text-[15px] text-muted">{v.line}</span> : null}
        </header>
        <PayoutCalendar view={v} />
      </main>
    </div>
  );
}
