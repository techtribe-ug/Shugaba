import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live";
import { BrandBar } from "@/components/ui/top-bar";
import { CAST, FAMILY_CIRCLE_ID } from "@/lib/demo/cast";
import { GOLDEN_STEPS, goldenState } from "@/lib/demo/golden";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { previewText } from "@/lib/notify/channels";
import { paypalStatus } from "@/lib/paypal";
import { JudgePanel } from "./panel";

export const dynamic = "force-dynamic";

/** Judge panel (design: GJudge). One button walks the golden path; every step is real engine work. */
export default async function Judge() {
  if (process.env.DEMO_MODE !== "true") notFound();
  const g = await goldenState();
  const musaRecovery = g.recoveries?.find((r) => r.status !== "PAID") ?? null;
  const agreedTrade = g.trades?.find((t) => t.status === "AGREED") ?? null;
  const sent = await db()
    .select({ id: s.outboundMessages.id, template: s.outboundMessages.template, params: s.outboundMessages.paramsJson, status: s.outboundMessages.status, name: s.members.name, at: s.outboundMessages.createdAt })
    .from(s.outboundMessages)
    .innerJoin(s.members, eq(s.members.id, s.outboundMessages.memberId))
    .orderBy(desc(s.outboundMessages.createdAt))
    .limit(5);
  return (
    <main className="mx-auto max-w-[880px] px-4 py-11 sm:px-6 rise">
      <LiveRefresh circleId={FAMILY_CIRCLE_ID} />
      <BrandBar label="Judge panel" />
      <h1 className="num text-[40px] font-bold leading-[1.05] tracking-tight">Walk the whole circle.</h1>
      <p className="mt-3 text-[17px] text-muted">Every step runs the real engine against the PayPal sandbox or the mock.</p>
      <ol aria-label="Steps" className="mt-9 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {GOLDEN_STEPS.map((label, i) => {
          const n = i + 1;
          const done = n <= g.step;
          const next = n === g.step + 1;
          return (
            <li key={label} aria-current={next ? "step" : undefined} className="flex items-center gap-2.5">
              <span className={`num flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${done ? "bg-paid text-white" : next ? "bg-text text-white" : "bg-surface text-muted"}`}>{n}</span>
              <span className={`text-[15px] font-bold ${done || next ? "text-text" : "text-[#A1A1AA]"}`}>{label}</span>
            </li>
          );
        })}
      </ol>
      <JudgePanel
        step={g.step}
        nextLabel={GOLDEN_STEPS[g.step] ?? null}
        circleId={FAMILY_CIRCLE_ID}
        recoveryOpen={!!musaRecovery}
        recoveryPaid={musaRecovery?.amountPaid ?? 0}
        tradeId={agreedTrade?.id ?? null}
        outage={paypalStatus().simulated}
      />
      {sent.length ? (
        <section aria-label="WhatsApp" className="mt-12">
          <h2 className="text-[13px] font-bold text-[#A1A1AA]">WhatsApp {process.env.WHATSAPP_MODE === "cloud" ? "" : "(mock, not sent)"}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {sent.map((m) => (
              <li key={m.id} className="max-w-[440px] rounded-[14px] bg-surface px-4 py-3">
                <span className="text-[13px] font-bold text-muted">To {m.name}</span>
                <p className="mt-0.5 text-[15px]">{previewText(m.template, m.params as string[])}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-label="See it as" className="mt-12">
        <h2 className="text-[13px] font-bold text-[#A1A1AA]">See it as</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {[...CAST.map((c) => ({ key: c.key, name: c.name })), { key: "analyst", name: "Operator" }].map((c) => (
            <li key={c.key}>
              <a href={`/demo/as/${c.key}`} target="_blank" rel="noopener" className="flex h-11 items-center rounded-[12px] border border-line px-4 text-[15px] font-bold text-text no-underline">
                {c.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-muted">Opens a new tab. The demo has one login per browser, so the last one you open wins.</p>
      </section>
    </main>
  );
}
