import Link from "next/link";
import { redirect } from "next/navigation";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

const LANG = { en: "English", pcm: "Pidgin", ha: "Hausa" } as const;

export default async function Settings() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/settings");
  const rows = [
    ["Name", me.name],
    ["Language", LANG[me.language as keyof typeof LANG] ?? me.language],
    ["Country", me.country],
  ];
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <BackBar href="/home" title="Settings" />
      <main className="flex flex-1 flex-col px-5 pt-2 pb-6 rise">
        <dl className="flex flex-col">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between border-b border-surface py-4">
              <dt className="text-[15px] text-muted">{k}</dt>
              <dd className="text-[15px] font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href="/score" className="flex min-h-12 items-center justify-between border-b border-surface text-[15px] font-bold text-text no-underline">
          My score <span className="num text-muted">{me.circleScore}</span>
        </Link>
        <form action={logout} className="mt-auto">
          <button className="flex h-13 w-full items-center justify-center text-[15px] font-bold text-failed">Log out</button>
        </form>
      </main>
    </div>
  );
}
