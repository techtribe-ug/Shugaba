import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Avatar } from "@/components/avatar";
import { Pebble } from "@/components/pebble";
import { currentMember } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { circleByInvite } from "@/lib/engine/circles";
import { formatCents } from "@/lib/protocol";
import { protectionFee } from "@/lib/treasury";
import { JoinButton } from "./join-button";

export const dynamic = "force-dynamic";

export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/join/${code}`);
  const circle = await circleByInvite(code);
  if (!circle) notFound();
  const [mine] = await db().select().from(s.memberships).where(and(eq(s.memberships.circleId, circle.id), eq(s.memberships.memberId, me.id)));
  if (mine?.status === "ACTIVE") redirect(`/c/${circle.id}`);
  const ms = await db().select().from(s.memberships).where(eq(s.memberships.circleId, circle.id));
  const [owner] = await db().select({ name: s.members.name }).from(s.members).where(eq(s.members.id, circle.createdBy));
  const fee = protectionFee(circle.contributionAmount, circle.protectionTier);
  const per = circle.frequency === "WEEKLY" ? "week" : circle.frequency === "DAILY" ? "day" : "month";
  const rules = [
    [`Pay ${formatCents(circle.contributionAmount + fee.fee)} every ${per}`, `${formatCents(circle.contributionAmount)} to the pot, ${formatCents(fee.fee)} to the protection pool.`],
    ["Turns follow Circle Score", "Highest score goes first. You can swap later."],
    [`Late? You get ${circle.graceHours} hours`, "Then the pool covers you and you pay it back."],
    ["Payouts only go to your own PayPal", "Nobody can redirect your money."],
  ];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-6 pt-14 pb-7 rise">
      <div className="flex items-center">
        {Array.from({ length: circle.size }, (_, i) => (
          <span key={i} className="rounded-full" style={{ marginLeft: i ? -10 : 0, boxShadow: "0 0 0 3px #fff" }}>
            {i < ms.length ? <Avatar size={38} /> : <span className="block h-[38px] w-[38px] rounded-full border-2 border-dashed border-[#D4D4D8] bg-white" />}
          </span>
        ))}
      </div>
      <h1 className="num mt-5 text-[32px] font-bold leading-tight tracking-tight">{owner?.name ?? "Someone"} invited you to {circle.name}</h1>
      <p className="mt-2.5 text-base text-muted">
        {circle.size} people · {formatCents(circle.contributionAmount)} a {per} · you get <b className="num text-text">{formatCents(circle.contributionAmount * circle.size)}</b> once
      </p>
      <div className="mt-6 flex items-start gap-2.5">
        <Pebble size={26} />
        <span className="pt-0.5 text-[15px]">Here are the rules everyone signs:</span>
      </div>
      <ol id="rules" className="mt-3">
        {rules.map(([title, sub], i) => (
          <li key={i} id={`rule-${i + 1}`} className="flex gap-3.5 border-t border-surface py-3">
            <span className="num w-4 text-[15px] font-bold text-[#A1A1AA]">{i + 1}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">{title}</span>
              <span className="text-[13px] text-muted">{sub}</span>
            </span>
          </li>
        ))}
      </ol>
      <JoinButton code={code} full={ms.length >= circle.size && !mine} forming={circle.status === "FORMING"} />
    </main>
  );
}
