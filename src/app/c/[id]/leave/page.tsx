import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { leaveTerms } from "@/lib/engine";
import { formatCents } from "@/lib/protocol";
import { LeaveButtons } from "./buttons";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "–");

type Row = [string, string, string?];

/** Leave a circle (design: GLeave). Shows exactly what happens to the member's money before they confirm. */
export default async function Leave({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/leave`);
  const [row] = await db().select({ m: s.memberships, name: s.circles.name }).from(s.memberships).innerJoin(s.circles, eq(s.circles.id, s.memberships.circleId)).where(and(eq(s.memberships.circleId, id), eq(s.memberships.memberId, me.id)));
  if (!row) notFound();
  const t = await leaveTerms(row.m.id);

  let lead: string;
  let rows: Row[] = [];
  let note: string | null = null;
  let label: string | null = null;
  if (t.kind === "forming") {
    lead = "The circle hasn't started, so leaving is free.";
    label = "Leave the circle";
  } else if (t.kind === "refund") {
    lead = "You haven't been paid out yet, so your money comes back. Sooner if someone takes your seat.";
    rows = [
      ["Paid in so far", formatCents(t.paidIn)],
      ["Protection fees, kept", `−${formatCents(t.feesKept)}`, "var(--muted)"],
      ["Comes back to you", formatCents(t.refund), "var(--paid)"],
      ["When", day(t.when)],
    ];
    note = t.shortNotice ? "A round is being collected now, so leaving costs 10 points of your Circle Score." : t.noticeBy ? `Leave by ${day(t.noticeBy)} and your Circle Score doesn't change.` : null;
    label = t.refund > 0 ? `Leave and get ${formatCents(t.refund)} back` : "Leave the circle";
  } else if (t.kind === "owes") {
    lead = `You got ${formatCents(t.collected)}${t.collectedAt ? ` on ${day(t.collectedAt)}` : ""}. The others are still paying you back, so you still owe your share.`;
    rows = [
      ["Still to pay", formatCents(t.stillToPay), "var(--grace)"],
      ["Or keep paying", `${formatCents(t.perTurn)} a turn`],
      ["Circle Score", "Safe if paid"],
    ];
    note = "If payments stop, the pool covers the group and you get an invoice. Unpaid: score −60.";
    label = t.stillToPay > 0 ? `Pay ${formatCents(t.stillToPay)} and leave` : "Leave the circle";
  } else {
    lead = t.reason;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <BackBar href={`/c/${id}`} title="Leave a circle" />
      <main className="flex flex-1 flex-col px-5 pt-2 pb-6 rise">
        <h1 className="num text-[28px] font-bold leading-tight tracking-tight">Leave {row.name}?</h1>
        <p className="mt-2.5 text-base text-muted">{lead}</p>
        {rows.length ? (
          <dl className="mt-6 flex flex-col border-t border-surface">
            {rows.map(([k, v, color]) => (
              <div key={k} className="flex items-baseline justify-between border-b border-surface py-3.5">
                <dt className="text-[15px] text-[#52525B]">{k}</dt>
                <dd className="num text-[17px] font-bold" style={{ color: color ?? "var(--text)" }}>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {note ? <p className="mt-4 text-sm text-muted">{note}</p> : null}
        <LeaveButtons circleId={id} label={label} />
      </main>
    </div>
  );
}
