import { NoCircles } from "./empty";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/pebble";
import { currentMember } from "@/lib/auth/session";
import { formatCents, levelFor } from "@/lib/protocol";
import { myCircles } from "@/lib/views/circle";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/home");
  const circles = await myCircles(me.id);
  if (circles.length === 1) redirect(`/c/${circles[0]!.id}`);
  const level = levelFor(me.circleScore);
  return (
    <main className="mx-auto max-w-[480px] px-5 pt-5 pb-10 rise">
      <header className="flex items-center gap-2">
        <Logo size={24} />
        <span className="flex-1" />
        <form action={logout}>
          <button className="h-11 text-sm font-bold text-muted">Log out</button>
        </form>
      </header>
      <Link href="/score" className="mt-8 flex items-center gap-4 no-underline text-text">
        <Avatar size={56} levelColor={level.color} />
        <span className="flex flex-col">
          <span className="text-[15px] font-bold">{me.name}</span>
          <span className="text-sm text-muted">
            <span className="num font-bold text-text">{me.circleScore}</span> · {level.title}
          </span>
        </span>
      </Link>
      <h2 className="mt-10 text-[13px] font-bold text-[#A1A1AA]">Your circles</h2>
      {circles.length === 0 ? (
        <NoCircles />
      ) : (
        <ul className="mt-2 divide-y divide-surface border-y border-surface">
          {circles.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.id}`} className="flex items-center gap-3 py-4 text-text no-underline">
                <span className="flex flex-1 flex-col">
                  <span className="text-base font-bold">{c.name}</span>
                  <span className="text-[13px] text-muted">
                    {c.size} people · <span className="num">{formatCents(c.contribution)}</span> each · {c.status.toLowerCase()}
                  </span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/circles/new" className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-[14px] bg-text text-base font-bold text-white no-underline">
        {circles.length === 0 ? "Start a circle" : "New circle"}
      </Link>
    </main>
  );
}
