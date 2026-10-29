"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Pebble, type PebbleState } from "@/components/pebble";
import { PayPalWord } from "@/components/ui/top-bar";
import { formatCents, type Language } from "@/lib/protocol";
import type { ChatMessage } from "@/lib/views/chat";
import { payFromChat, sendChat } from "./actions";

const STATUS: Record<PebbleState, { text: string; color: string }> = {
  watching: { text: "Here for you", color: "var(--muted)" },
  thinking: { text: "Thinking…", color: "var(--muted)" },
  concerned: { text: "Looking at your payment", color: "var(--muted)" },
  guarding: { text: "Keeping the circle safe", color: "var(--muted)" },
  pleased: { text: "All good", color: "var(--paid)" },
};
const HINT: Record<Language, string> = { en: "Ask or say anything", pcm: "Ask anything", ha: "Tambayi komai" };

function marker(iso: string, prev: string | null): string | null {
  const d = new Date(iso);
  if (prev && new Date(prev).toDateString() === d.toDateString() && d.getTime() - new Date(prev).getTime() < 3_600_000) return null;
  const today = new Date();
  const y = new Date(today.getTime() - 86_400_000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function Chat({ circleId, messages, initialQuestion, paid, language }: { circleId: string; messages: ChatMessage[]; initialQuestion: string | null; paid: boolean; language: Language }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paying, setPaying] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shown, addOptimistic] = useOptimistic(messages, (cur, msg: string) => [...cur, { id: `tmp-${cur.length}`, role: "user" as const, content: msg, at: new Date().toISOString(), meta: {} }]);
  const bottom = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const last = [...shown].reverse().find((m) => m.role === "assistant");
  const mood: PebbleState = pending ? "thinking" : paying ? "guarding" : paid ? "pleased" : last?.meta.mood ?? "watching";
  const status = paying ? { text: "Paying with PayPal…", color: "var(--muted)" } : STATUS[mood];

  function send(msg: string) {
    const m = msg.trim();
    if (!m) return;
    setText("");
    setError(null);
    start(async () => {
      addOptimistic(m);
      const r = await sendChat(circleId, m);
      if (!r.ok) setError(r.error ?? "That did not work.");
      router.refresh();
    });
  }

  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      router.replace(`/c/${circleId}/chat`);
      send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [shown.length, pending]);

  async function pay(action: string) {
    setPaying(true);
    setError(null);
    const r = await payFromChat(circleId, action);
    if (r.ok && r.url) window.location.href = r.url;
    else {
      setPaying(false);
      setError(r.error ?? "That did not work.");
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-[560px] flex-col">
      <header className="flex items-center gap-2.5 pt-3.5 pr-4 pb-2.5 pl-2">
        <Link href={`/c/${circleId}`} aria-label="Back" className="flex h-11 w-11 items-center justify-center text-text"><Icon name="back" /></Link>
        <Pebble size={34} state={mood} />
        <div className="flex flex-col">
          <span className="text-base font-extrabold">Shugaba</span>
          <span aria-live="polite" className="text-[13px] font-semibold" style={{ color: status.color }}>{status.text}</span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-2 pr-5">
        <div className="flex-1" />
        {shown.length === 0 ? <p className="text-center text-[15px] text-muted">Ask about your turn, what you owe, or the pool.</p> : null}
        {shown.map((m, i) => {
          const mk = marker(m.at, i ? shown[i - 1]!.at : null);
          const isLast = m === last;
          return (
            <div key={m.id} className={`flex flex-col gap-2 ${isLast ? "" : "opacity-60"}`}>
              {mk ? <span className="num self-center pt-1.5 text-xs text-[#A1A1AA]">{mk}</span> : null}
              {m.role === "user" ? (
                <p className="max-w-[80%] self-end text-right text-[15px] text-[#52525B]">{m.content}</p>
              ) : (
                <div className="flex gap-2.5">
                  <span className="pt-0.5"><Pebble size={22} state={m.meta.mood ?? "watching"} /></span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className={isLast && !m.meta.plan ? "text-2xl font-semibold leading-tight tracking-tight" : "text-[15px] leading-normal"}>
                      <WithRule text={m.content} rule={m.meta.rule ?? null} circleId={circleId} />
                    </p>
                    {m.meta.plan ? (
                      <section aria-label="Plan" className="flex flex-col">
                        {m.meta.plan.map((p, j) => {
                          const done = paid && isLast && j === 0;
                          return (
                            <div key={j} className="flex items-center gap-3 border-t border-surface py-[11px]">
                              <span className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full ${done ? "bg-paid" : "shadow-[inset_0_0_0_1.5px_#D4D4D8]"}`}>{done ? <Icon name="check" size={13} stroke={3} color="#fff" /> : null}</span>
                              <span className={`flex-1 text-[15px] font-semibold ${done ? "" : "text-[#52525B]"}`}>{p.text}</span>
                              {p.amount !== null ? <span className={`num text-base font-bold ${done ? "text-paid" : ""}`}>{formatCents(p.amount)}</span> : null}
                            </div>
                          );
                        })}
                      </section>
                    ) : null}
                    {isLast && !pending ? <Actions m={m} circleId={circleId} paying={paying} onPay={pay} onReply={send} /> : null}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {pending ? (
          <div className="flex gap-2.5 opacity-70">
            <Pebble size={22} state="thinking" />
            <span className="text-[15px] text-muted">…</span>
          </div>
        ) : null}
        {error ? <p role="alert" className="text-sm text-failed">{error}</p> : null}
        <div ref={bottom} />
      </main>

      <form
        className="flex items-center gap-2.5 px-4 pt-2.5 pb-6"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="ask" className="sr-only">Ask Shugaba</label>
        <input id="ask" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} autoComplete="off" placeholder={HINT[language]} className="h-[52px] min-w-0 flex-1 border-b-[1.5px] border-text bg-transparent px-0.5 text-base font-medium outline-none" />
        <button aria-label="Send" disabled={pending || !text.trim()} className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-text disabled:opacity-40"><Icon name="send" color="#fff" /></button>
      </form>
    </div>
  );
}

function Actions({ m, circleId, paying, onPay, onReply }: { m: ChatMessage; circleId: string; paying: boolean; onPay: (a: string) => void; onReply: (t: string) => void }) {
  const a = m.meta.action ?? "none";
  const isPay = a === "pay_catchup" || a === "pay_recovery_half" || a === "pay_recovery_rest";
  const links: Record<string, [string, string]> = { open_calendar: ["Open calendar", `/c/${circleId}/calendar`], open_ledger: ["Open ledger", `/c/${circleId}/ledger`], open_swap: ["Review the swap", `/c/${circleId}`] };
  return (
    <div className="flex flex-col gap-2 pt-1">
      {isPay && m.meta.actionAmount ? (
        <button onClick={() => onPay(a)} disabled={paying} className="h-[54px] rounded-[14px] bg-text px-5 text-base font-bold text-white disabled:opacity-60">
          {paying ? "Opening PayPal…" : (<>Pay {formatCents(m.meta.actionAmount)} with <PayPalWord /></>)}
        </button>
      ) : null}
      {links[a] ? <Link href={links[a][1]} className="flex min-h-11 items-center text-[15px] font-bold text-accent">{links[a][0]}</Link> : null}
      {m.meta.quickReplies?.length ? (
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1">
          {m.meta.quickReplies.map((q, i) => (
            <button key={q} onClick={() => onReply(q)} className={i === 0 ? "h-11 rounded-[12px] bg-text px-5 text-[15px] font-extrabold text-white" : "h-11 text-[15px] font-bold text-text"}>{q}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Turns "Rule 4" (or "Doka ta 4") in Shugaba's text into a link to that rule; appends one if the text has none. */
function WithRule({ text, rule, circleId }: { text: string; rule: number | null; circleId: string }) {
  if (!rule) return <>{text}</>;
  const href = `/c/${circleId}/rules#rule-${rule}`;
  const m = text.match(new RegExp(`(Rule ${rule}|Doka ta ${rule})`));
  if (!m || m.index === undefined) return <>{text} <Link href={href} className="font-bold">Rule {rule}</Link></>;
  return <>{text.slice(0, m.index)}<Link href={href} className="font-bold">{m[0]}</Link>{text.slice(m.index + m[0].length)}</>;
}
