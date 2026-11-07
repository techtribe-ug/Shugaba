import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Pebble } from "@/components/pebble";
import { ScoreBar } from "@/components/score-bar";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { LEVELS } from "@/lib/protocol";
import { myCircles } from "@/lib/views/circle";
import { myScoreView } from "@/lib/views/score";

export const dynamic = "force-dynamic";

const PERK: Record<string, string> = { Newcomer: "Circles up to $50 a turn", Steady: "Circles up to $200 a turn", Trusted: "1% protection fee", Pillar: "Lowest fees" };

/** My score (design: GMyScore) with the levels underneath (design: GScore). */
export default async function MyScore() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/score");
  const v = await myScoreView(me.id);
  if (!v) redirect("/login");
  const [circle] = await myCircles(me.id);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <BackBar href="/home" title="My score" />
      <main className="flex flex-col gap-6 px-5 pt-4 pb-10 rise">
        <div className="flex items-center gap-5">
          <Avatar size={76} levelColor={v.level.color} levelScale={1.1} />
          <div className="flex flex-col">
            <span className="num text-[52px] font-bold leading-none tracking-tight">{v.score}</span>
            <span className="num text-base font-bold" style={{ color: v.level.color }}>{v.level.title}</span>
          </div>
        </div>
        <ScoreBar score={v.score} />
        <div className="flex items-start gap-2.5">
          <Pebble size={24} state="pleased" />
          <span className="pt-0.5 text-[15px]">{v.line}</span>
        </div>
        <section aria-labelledby="changes">
          <h2 id="changes" className="text-[13px] font-bold text-[#A1A1AA]">What changed it</h2>
          {v.events.length ? (
            <ul className="mt-2">
              {v.events.map((e) => (
                <li key={e.id} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-surface py-3">
                  <span className="num text-base font-bold" style={{ color: e.delta >= 0 ? "var(--paid)" : "var(--failed)" }}>{e.delta >= 0 ? `+${e.delta}` : `−${-e.delta}`}</span>
                  <span className="text-[15px]">{e.label}</span>
                  <span className="num text-[13px] text-muted">{new Date(e.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[15px] text-muted">Nothing yet. Your first on-time payment adds 4.</p>
          )}
        </section>
        {circle ? <Link href={`/c/${circle.id}/chat?q=${encodeURIComponent("Can you review my score?")}`} className="flex min-h-11 items-center text-[15px] font-bold text-accent">Something wrong? Ask for a review</Link> : null}
        <section aria-labelledby="levels" className="border-t border-line pt-5">
          <h2 id="levels" className="text-[13px] font-bold text-[#A1A1AA]">Levels</h2>
          <p className="mt-1 text-[15px] text-muted">Pebble sits with you and gives you a name as trust grows.</p>
          <ul className="mt-3">
            {LEVELS.map((l) => (
              <li key={l.title} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-surface py-3">
                <Avatar size={36} levelColor={l.color} />
                <span className="flex flex-col">
                  <span className="num text-[15px] font-bold" style={{ color: l.color }}>{l.title}</span>
                  <span className="text-[13px] text-muted">{PERK[l.title]}</span>
                </span>
                <span className="num text-[13px] text-muted">{l.min}–{l.max}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
