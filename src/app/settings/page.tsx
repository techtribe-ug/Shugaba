import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { redirect } from "next/navigation";
import { BackBar } from "@/components/ui/top-bar";
import { TabBar } from "@/components/ui/tab-bar";
import { currentMember } from "@/lib/auth/session";
import { whatsAppChannel } from "@/lib/notify/optin";
import { whatsAppLive } from "@/lib/notify/channels";
import { logout } from "../actions";
import { WhatsAppRow } from "./whatsapp";

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
  const wa = await whatsAppChannel(me.id);
  // The member's own PayPal account (shown only to them).
  const [pp] = await db().select({ paypalEmail: s.members.paypalEmail }).from(s.members).where(eq(s.members.id, me.id));
  const circles = await db().select({ id: s.circles.id, name: s.circles.name }).from(s.memberships).innerJoin(s.circles, eq(s.circles.id, s.memberships.circleId)).where(and(eq(s.memberships.memberId, me.id), inArray(s.memberships.status, ["SIGNED", "ACTIVE", "PAUSED"]), inArray(s.circles.status, ["FORMING", "ACTIVE", "PAUSED"])));
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
        <div className="flex items-center justify-between gap-3 border-b border-surface py-4">
          <span className="text-[15px] text-muted">
            <span className="font-extrabold italic text-text">PayPal</span>
          </span>
          {pp?.paypalEmail ? (
            <span className="flex min-w-0 flex-col items-end">
              <span className="max-w-[240px] truncate text-[15px] font-bold">{pp.paypalEmail}</span>
              <span className="text-[13px] font-bold text-paid">Connected</span>
            </span>
          ) : (
            <span className="text-[15px] text-muted">Not connected</span>
          )}
        </div>
        <WhatsAppRow phone={wa && wa.optedInAt && !wa.optedOutAt ? wa.phoneE164 : null} live={whatsAppLive()} />
        <Link href="/score" className="flex min-h-12 items-center justify-between border-b border-surface text-[15px] font-bold text-text no-underline">
          My score <span className="num text-muted">{me.circleScore}</span>
        </Link>
        {circles.map((c) => (
          <Link key={c.id} href={`/c/${c.id}/leave`} className="flex min-h-14 items-center justify-between border-b border-surface text-[15px] font-bold text-failed no-underline">
            Leave {c.name}
          </Link>
        ))}
        <form action={logout} className="mt-auto">
          <button className="flex h-13 w-full items-center justify-center text-[15px] font-bold text-failed">Log out</button>
        </form>
      </main>
      {circles[0]?.id ? <TabBar circleId={circles[0]!.id} active="me" /> : null}
    </div>
  );
}
