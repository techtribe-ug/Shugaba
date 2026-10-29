import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Pebble } from "@/components/pebble";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { isMember } from "@/lib/views/circle";
import { memberProfile } from "@/lib/views/score";

export const dynamic = "force-dynamic";

/** A member as their circle sees them (design: GMember). */
export default async function Member({ params }: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/m/${memberId}`);
  if (!(await isMember(id, me.id))) notFound();
  if (memberId === me.id) redirect("/score");
  const v = await memberProfile(id, memberId);
  if (!v) notFound();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <BackBar href={`/c/${id}`} />
      <main className="flex flex-1 flex-col items-center px-5 pt-4 pb-8 rise">
        <Avatar size={96} levelColor={v.level.color} levelScale={1.1} />
        <h1 className="num mt-4 text-[32px] font-bold tracking-tight">{v.name}</h1>
        <span className="num flex gap-2 text-base font-bold"><span style={{ color: v.level.color }}>{v.level.title}</span><span className="text-muted">{v.score}</span></span>
        <dl className="mt-7 w-full">
          {v.facts.map(([k, val]) => (
            <div key={k} className="flex items-baseline justify-between border-t border-surface py-3.5">
              <dt className="text-[15px] text-muted">{k}</dt>
              <dd className="num text-[15px] font-bold">{val}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex w-full items-start gap-2.5">
          <Pebble size={24} />
          <span className="pt-0.5 text-[15px]">{v.line}</span>
        </div>
        <div className="mt-auto flex w-full flex-col gap-1 pt-8">
          {v.canSwap ? <Link href={`/c/${id}/calendar`} className="flex h-14 items-center justify-center rounded-[14px] bg-text text-base font-extrabold text-white no-underline">Offer a swap</Link> : null}
          <Link href={`/c/${id}/chat`} className="flex h-13 items-center justify-center text-[15px] font-bold text-muted no-underline">Ask Shugaba</Link>
        </div>
      </main>
    </div>
  );
}
