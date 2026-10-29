import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BackBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { ruleList } from "@/lib/circles/rule-list";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { isMember } from "@/lib/views/circle";

export const dynamic = "force-dynamic";

/** The rules this circle signed (design: GRules). Shugaba links here as /c/[id]/rules#rule-N. */
export default async function Rules({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${id}/rules`);
  if (!(await isMember(id, me.id))) notFound();
  const [circle] = await db().select().from(s.circles).where(eq(s.circles.id, id));
  if (!circle) notFound();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <BackBar href={`/c/${id}`} title="Rules" />
      <main className="px-5 pt-3 pb-8 rise">
        <h1 className="text-[22px] font-extrabold">{circle.name}</h1>
        <p className="mt-1 text-[15px] text-muted">Everyone signed these before joining.</p>
        <ol className="mt-5">
          {ruleList(circle).map(([title, sub], i) => (
            <li key={i} id={`rule-${i + 1}`} className="flex scroll-mt-20 gap-3.5 border-t border-surface py-4 target:bg-surface">
              <span className="num w-5 pt-0.5 text-[15px] font-bold text-muted">{i + 1}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold">{title}</span>
                <span className="text-sm text-muted">{sub}</span>
              </span>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
