import Link from "next/link";
import { redirect } from "next/navigation";
import { Pebble } from "@/components/pebble";
import { currentMember } from "@/lib/auth/session";
import { memberFacts } from "@/lib/agents/facts";
import { paidMessage } from "@/lib/agents/shugaba";
import { completeMemberPayment, EngineError } from "@/lib/engine";
import { saveChat } from "@/lib/views/chat";

export const dynamic = "force-dynamic";

/** PayPal returns here after the member approves an order (`token` is the order id). We capture and apply it. */
export default async function OrderReturn({ searchParams }: { searchParams: Promise<{ token?: string; from?: string }> }) {
  const { token, from } = await searchParams;
  const me = await currentMember();
  if (!me) redirect("/login");
  if (!token) redirect("/home");
  let result: Awaited<ReturnType<typeof completeMemberPayment>> | null = null;
  try {
    result = await completeMemberPayment(token, me.id);
  } catch (e) {
    if (!(e instanceof EngineError)) throw e;
  }
  if (result?.ok) {
    if (!result.already) {
      const f = await memberFacts(result.circleId, me.id);
      if (f) await saveChat(result.circleId, me.id, "assistant", paidMessage(f), { mood: "pleased", quickReplies: [] }, f.member.language);
    }
    redirect(from === "money" ? `/c/${result.circleId}/money?paid=1` : `/c/${result.circleId}/chat?paid=1`);
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-5 px-6 text-center rise">
      <Pebble size={72} state="concerned" />
      <h1 className="text-2xl font-extrabold">The payment didn&apos;t go through.</h1>
      <p className="text-[15px] text-muted">Nothing was taken. You can try again from the chat.</p>
      <Link href={result ? `/c/${result.circleId}/chat` : "/home"} className="text-[15px] font-bold text-accent">Back to Shugaba</Link>
    </main>
  );
}
