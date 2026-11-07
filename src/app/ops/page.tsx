import { forbidden, redirect } from "next/navigation";
import { LiveRefresh } from "@/components/live";
import { BrandBar } from "@/components/ui/top-bar";
import { currentMember } from "@/lib/auth/session";
import { formatCents } from "@/lib/protocol";
import { activityLog, cashFlow, circleHealth, heldPayouts, latestTraces, openFlags, recoveriesView, riskHeatmap, scoreDistribution, todayStats } from "@/lib/views/ops";
import { Analyst, FlagActions, HeldActions, LogoutLink } from "./client";

export const dynamic = "force-dynamic";

const usd = (c: number) => formatCents(Math.round(c));
const RULE_LABEL: Record<string, string> = { SHARED_PAYMENT_ACCOUNT: "Same PayPal on two seats", METHOD_CHANGED_BEFORE_PAYOUT: "PayPal changed before payout", JOINED_TOGETHER_DEFAULTED_TOGETHER: "Joined together, missed together" };

function Ring({ value }: { value: number }) {
  // The ring shows up to 4 missed payments of cover; red under 1.
  const pct = Math.min(1, value / 4);
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = value < 1 ? "var(--failed)" : value < 2 ? "var(--grace)" : "var(--paid)";
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface)" strokeWidth="6" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 28 28)" />
    </svg>
  );
}

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`flex flex-col gap-3 ${className}`}>
      <h2 className="text-[13px] font-bold text-[#A1A1AA]">{title}</h2>
      {children}
    </section>
  );
}

/** Control tower (design: GOps). Operators only; every action writes OPERATOR_ACTION with a reason. */
export default async function Ops() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/ops");
  if (!me.isOperator) forbidden();
  const [today, held, circles, heat, flow, recs, flags, traces, log, scores] = await Promise.all([todayStats(), heldPayouts(), circleHealth(), riskHeatmap(), cashFlow(), recoveriesView(), openFlags(), latestTraces(), activityLog(), scoreDistribution()]);
  const flowMax = Math.max(1, ...flow.map((f) => Math.abs(f.value)));
  const scoreMax = Math.max(1, ...scores.map((s) => s.n));
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-4 py-8 sm:px-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <LiveRefresh circleId="*" />
      <main className="flex min-w-0 flex-col gap-10">
        <BrandBar label="Control tower" right={<span className="flex items-center gap-4"><span className="num text-sm text-muted">{new Date(today.now).toUTCString().slice(0, 22)}</span><LogoutLink /></span>} />

        <section aria-label="Today" className="-mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="flex flex-col gap-1"><span className="num text-[40px] font-bold leading-none tracking-tight">{today.paidInFull}<span className="text-[#A1A1AA]">/{today.payouts}</span></span><span className="text-sm text-muted">payouts paid in full</span></div>
          <div className="flex flex-col gap-1"><span className="num text-[40px] font-bold leading-none tracking-tight">{usd(today.reserve)}</span><span className="text-sm text-muted">in reserve</span></div>
          <div className="flex flex-col gap-1"><span className="num text-[40px] font-bold leading-none tracking-tight">{today.recovering}</span><span className="text-sm text-muted">being paid back</span></div>
        </section>

        {held.length ? (
          <Section title="Needs you">
            {held.map((h) => (
              <div key={h.roundId} className="flex flex-col gap-3 rounded-[16px] border border-[#F2D9B3] bg-[#FFFBF3] p-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-base font-extrabold">Holding <span className="num">{usd(h.amount)}</span> for {h.circle}</span>
                  <span className="text-sm text-muted">{h.why}</span>
                </div>
                <HeldActions flagId={h.flagId} circleId={h.circleId} />
              </div>
            ))}
          </Section>
        ) : null}

        <Section title="Ask Shugaba about your circles">
          <Analyst />
        </Section>

        <Section title="Pool coverage">
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {circles.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-1.5">
                <Ring value={c.coverage} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-bold">{c.name}</span>
                  <span className="num text-[13px] text-muted">{c.coverage.toFixed(1)}× cover · {usd(c.pool)} · {c.status.toLowerCase()}</span>
                  {c.reserveOwed ? <span className="num text-[13px] text-failed">owes reserve {usd(c.reserveOwed)}</span> : null}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-muted">Ring shows how many missed payments the circle&apos;s pool can cover, up to 4. Red is under 1.</p>
        </Section>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <Section title="Default risk, next rounds">
            {heat.length ? (
              <table className="num w-full border-separate border-spacing-1 text-[13px]">
                <tbody>
                  {heat.map((row) => (
                    <tr key={row.circle}>
                      <th scope="row" className="pr-2 text-left font-bold">{row.circle}</th>
                      {row.cells.map((c) => (
                        <td key={c.seq} title={`Round ${c.seq}: ${Math.round(c.p * 100)}% chance someone misses`} className="h-9 w-12 rounded-md text-center font-bold" style={{ background: c.held ? "#E4E4E7" : `rgba(220, 38, 38, ${0.08 + c.p * 0.9})`, color: c.p > 0.5 ? "#fff" : "var(--text)" }}>
                          {c.held ? "held" : `${Math.round(c.p * 100)}%`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-muted">No running circles.</p>}
            <p className="text-[13px] text-muted">Chance at least one member misses, from Circle Scores; early takers count higher.</p>
          </Section>

          <Section title="Cash flow">
            <ul className="flex flex-col gap-2">
              {flow.map((f) => (
                <li key={f.label} className="grid grid-cols-[110px_minmax(0,1fr)_90px] items-center gap-3 text-[13px]">
                  <span className="font-bold">{f.label}</span>
                  <span className="h-3 rounded-full" style={{ width: `${(Math.abs(f.value) / flowMax) * 100}%`, background: f.value >= 0 ? "var(--paid)" : f.label === "Covers" ? "var(--accent)" : "var(--text)" }} />
                  <span className="num text-right font-bold">{f.value < 0 ? "−" : ""}{usd(Math.abs(f.value))}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section title="Recoveries">
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[560px] text-left text-[13px]">
              <thead className="text-[#A1A1AA]"><tr><th className="py-2 font-bold">Member</th><th className="font-bold">Circle</th><th className="font-bold">Paid</th><th className="font-bold">Status</th><th className="font-bold">Days open</th></tr></thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} className="border-t border-surface">
                    <td className="py-2.5 font-bold">{r.member}</td>
                    <td>{r.circle}</td>
                    <td>{usd(r.paid)} of {usd(r.due)}</td>
                    <td style={{ color: r.status === "PAID" ? "var(--paid)" : r.status === "PARTIAL" ? "var(--grace)" : "var(--text)" }}>{r.status.toLowerCase()}</td>
                    <td>{r.daysOpen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Fraud flags">
          {flags.length ? (
            <ul className="flex flex-col">
              {flags.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 border-t border-surface py-3 sm:flex-row sm:items-center">
                  <div className="flex flex-1 flex-col">
                    <span className="text-[15px] font-bold">{RULE_LABEL[f.rule] ?? f.rule}</span>
                    <span className="text-[13px] text-muted">{f.circle}{f.member ? ` · ${f.member}` : ""}</span>
                  </div>
                  {f.status === "OPEN" ? <FlagActions flagId={f.id} /> : <span className="text-[13px] font-bold text-muted">{f.status.toLowerCase()}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No flags.</p>}
        </Section>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Section title="Agent traces">
            <div className="overflow-x-auto">
              <table className="num w-full min-w-[520px] text-left text-[13px]">
                <thead className="text-[#A1A1AA]"><tr><th className="py-2 font-bold">Agent</th><th className="font-bold">Model</th><th className="font-bold">Prompt</th><th className="font-bold">Latency</th><th className="font-bold">Result</th></tr></thead>
                <tbody>
                  {traces.map((t) => (
                    <tr key={t.id} className="border-t border-surface">
                      <td className="py-2 font-bold">{t.agent}</td>
                      <td>{t.model}</td>
                      <td>{t.promptVersion}</td>
                      <td>{t.latencyMs ?? 0} ms</td>
                      <td className={t.error ? "text-failed" : "text-paid"}>{t.error ? "error" : "ok"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {traces.length === 0 ? <p className="py-2 text-sm text-muted">No agent calls yet.</p> : null}
            </div>
          </Section>
          <Section title="Members by level">
            <ul className="flex flex-col gap-2">
              {scores.map((b) => (
                <li key={b.title} className="grid grid-cols-[80px_minmax(0,1fr)_32px] items-center gap-3 text-[13px]">
                  <span className="font-bold">{b.title}</span>
                  <span className="h-3 rounded-full bg-text" style={{ width: `${(b.n / scoreMax) * 100}%` }} />
                  <span className="num text-right font-bold">{b.n}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </main>

      <aside aria-label="Shugaba today" className="flex flex-col gap-3 xl:sticky xl:top-8 xl:self-start">
        <h2 className="text-[13px] font-bold text-[#A1A1AA]">Shugaba today</h2>
        <ul className="flex flex-col">
          {log.map((l) => (
            <li key={l.id} className="flex gap-3 border-t border-surface py-3">
              <span aria-hidden className="mt-1.5 h-2 w-2 flex-none rounded-full bg-text" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px]">{l.text}</span>
                <span className="num text-xs text-muted">{l.circle} · {l.rule}</span>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
