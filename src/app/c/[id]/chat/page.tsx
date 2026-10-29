import { notFound, redirect } from "next/navigation";
import { LiveRefresh } from "@/components/live";
import { currentMember } from "@/lib/auth/session";
import { chatView } from "@/lib/views/chat";
import { isMember } from "@/lib/views/circle";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";

/** Chat with Shugaba (design: GChat). */
export default async function ChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; paid?: string }> }) {
  const { id } = await params;
  const { q, paid } = await searchParams;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/chat`);
  if (!(await isMember(id, me.id))) notFound();
  const v = await chatView(id, me.id);
  if (!v) notFound();
  return (
    <>
      <LiveRefresh circleId={id} />
      <Chat circleId={id} messages={v.messages} initialQuestion={q ?? null} paid={!!paid} language={v.facts.member.language} />
    </>
  );
}
