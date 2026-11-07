import Link from "next/link";
import { redirect } from "next/navigation";
import { Pebble } from "@/components/pebble";
import { currentMember } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { confirmMandate } from "@/lib/engine";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** PayPal sends the member back here after approving (or cancelling) the saved payment method. */
export default async function PayPalReturn({ searchParams }: { searchParams: Promise<{ membership?: string; cancel?: string }> }) {
  const { membership, cancel } = await searchParams;
  const me = await currentMember();
  if (!me) redirect("/login");
  const [m] = membership ? await db().select().from(s.memberships).where(and(eq(s.memberships.id, membership), eq(s.memberships.memberId, me.id))) : [];
  if (!m) redirect("/home");
  if (cancel) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-5 px-6 text-center rise">
        <Pebble size={72} />
        <h1 className="text-2xl font-extrabold">PayPal was not connected.</h1>
        <p className="text-[15px] text-muted">Your seat is held. Connect PayPal to take part.</p>
        <Link href={`/c/${m.circleId}`} className="text-[15px] font-bold text-accent">Back to the circle</Link>
      </main>
    );
  }
  if (m.status !== "ACTIVE") await confirmMandate(m.id);
  redirect(`/c/${m.circleId}`);
}
