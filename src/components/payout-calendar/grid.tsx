"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { requestSwapAction } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { btnPrimary } from "@/components/ui/top-bar";
import { formatCents } from "@/lib/protocol";
import type { CalendarView } from "@/lib/views/calendar";

type Turn = CalendarView["turns"][number];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const STATE: Record<Turn["state"], { label: string; color: string }> = {
  paid: { label: "Paid", color: "var(--paid)" },
  today: { label: "This round", color: "var(--text)" },
  held: { label: "Paused", color: "var(--grace)" },
  next: { label: "Next", color: "var(--muted)" },
  later: { label: "", color: "var(--muted)" },
};
const PERSON_COLOR: Record<string, string> = { PAID: "var(--paid)", LATE: "var(--grace)", FAILED: "var(--failed)", COVERED: "var(--accent)", RECOVERED: "var(--paid)", SCHEDULED: "#D4D4D8" };

/** CSS-grid timeline: one row per turn. Drag your own payout onto an earlier open turn to ask for a swap. */
export function GridCalendar({ view }: { view: CalendarView }) {
  const router = useRouter();
  const initial = view.turns.find((t) => t.state === "today" || t.state === "held" || t.state === "next") ?? view.turns[0];
  const [selected, setSelected] = useState<number | null>(initial?.seq ?? null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<number | null>(null);
  const [ask, setAsk] = useState<Turn | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sel = view.turns.find((t) => t.seq === selected) ?? null;

  // Pointer drag works for mouse and touch alike; HTML5 drag-and-drop does not fire on phones.
  useEffect(() => {
    if (!dragging) return;
    const targetAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-seq]");
      const seq = el ? Number(el.dataset.seq) : null;
      return seq && view.turns.find((t) => t.seq === seq)?.canTarget ? seq : null;
    };
    const move = (e: PointerEvent) => setOver(targetAt(e.clientX, e.clientY));
    const up = (e: PointerEvent) => {
      const seq = targetAt(e.clientX, e.clientY);
      setDragging(false);
      setOver(null);
      const t = view.turns.find((x) => x.seq === seq);
      if (t) setAsk(t);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, view.turns]);

  function send() {
    if (!ask) return;
    start(async () => {
      const r = await requestSwapAction(view.circle.id, ask.seq, reason || "I need my payout earlier");
      setAsk(null);
      setReason("");
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      if (r.agreed && r.tradeId) return router.push(`/c/${view.circle.id}/trades/${r.tradeId}`);
      setMsg({ ok: true, text: r.message ?? "" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
      <section aria-label="Turns" className="relative flex flex-col">
        <span aria-hidden className="absolute top-6 bottom-6 left-[83px] w-px bg-line" />
        {view.turns.map((t) => {
          const st = STATE[t.state];
          const isOver = over === t.seq;
          return (
            <div
              key={t.seq}
              data-seq={t.seq}
              className={`relative grid grid-cols-[56px_56px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[14px] px-1 py-2.5 transition-colors ${selected === t.seq ? "bg-surface" : ""} ${isOver ? "outline-2 outline-accent outline-dashed" : ""} ${dragging && t.canTarget && !isOver ? "outline-1 outline-line outline-dashed" : ""}`}
            >
              <button onClick={() => setSelected(t.seq)} aria-pressed={selected === t.seq} aria-label={`Turn ${t.seq}, ${day(t.date)}, ${t.who}`} className="absolute inset-0 rounded-[14px]" />
              <span className="num text-[13px] font-bold text-muted">{day(t.date)}</span>
              <span className="relative z-[1] flex justify-center">
                {t.isMine && t.state !== "paid" && view.myTurnSeq ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label="Drag your payout onto an earlier turn"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    className={`cursor-grab touch-none rounded-full ${dragging ? "scale-110 opacity-70" : ""}`}
                  >
                    <Avatar size={44} state="due" levelColor={t.level.color} />
                  </span>
                ) : (
                  <Avatar size={44} state={t.state === "paid" ? "paidout" : t.missed ? "covered" : "due"} levelColor={t.level.color} />
                )}
              </span>
              <span className="pointer-events-none flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-bold">{t.isMine ? "You" : t.who}</span>
                <span className="text-[13px]" style={{ color: st.color }}>{t.swap ? "Swap pending" : st.label}</span>
              </span>
              <span className="num pointer-events-none text-right text-[17px] font-bold" style={{ color: t.state === "paid" ? "var(--paid)" : "var(--text)" }}>{formatCents(t.amount)}</span>
            </div>
          );
        })}
        {view.myTurnSeq ? <p className="pt-3 text-[13px] text-muted">Need your payout sooner? Drag your picture onto an earlier turn.</p> : null}
      </section>

      {sel ? (
        <section aria-label="Turn details" className="flex flex-col gap-1 border-t border-line pt-5 lg:border-t-0 lg:pt-0">
          <span className="num text-[13px] font-bold text-muted">Turn {sel.seq} · {day(sel.date)}</span>
          <span className="num text-[28px] font-bold tracking-tight">{formatCents(sel.amount)} to {sel.isMine ? "you" : sel.who}</span>
          {sel.summary ? <span className="text-[15px] text-[#52525B]">{sel.summary}</span> : null}
          {sel.swap ? (
            <Link href={`/c/${view.circle.id}/trades/${sel.swap.tradeId}`} className="mt-1 flex min-h-11 items-center gap-2 text-[15px] font-bold text-accent">
              <Icon name="swap" size={16} /> Swap pending{sel.swap.with ? ` with ${sel.swap.with}` : ""}
            </Link>
          ) : sel.canTarget ? (
            <button onClick={() => setAsk(sel)} className="mt-1 flex min-h-11 items-center gap-2 self-start text-[15px] font-bold text-accent">
              <Icon name="swap" size={16} /> Ask {sel.who} to swap
            </button>
          ) : null}
          <ul className="mt-3 flex flex-col">
            {sel.people.map((p) => (
              <li key={p.name} className="flex items-center gap-3 border-t border-surface py-2.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: PERSON_COLOR[p.status] ?? "#D4D4D8" }} />
                <span className="flex-1 text-[15px]">{p.name}</span>
                <span className="text-[13px] text-muted">{p.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p role="status" aria-live="polite" className={`text-[15px] ${msg?.ok === false ? "text-failed" : "text-muted"}`}>{msg?.text ?? ""}</p>

      {ask ? (
        <div role="dialog" aria-modal="true" aria-label="Ask for a swap" className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => !pending && setAsk(null)}>
          <div className="w-full max-w-[420px] rounded-t-[22px] bg-bg p-5 pb-7 sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-extrabold">Ask {ask.who} for turn {ask.seq}?</h2>
            <p className="mt-1 text-[15px] text-muted">Your agent asks theirs, inside both your limits. You both sign before anything changes.</p>
            <label className="mt-4 block text-[13px] font-bold text-muted" htmlFor="why">Why (optional)</label>
            <input id="why" value={reason} maxLength={280} onChange={(e) => setReason(e.target.value)} placeholder="School fees are due" className="mt-1 h-12 w-full rounded-[12px] bg-surface px-4 text-base outline-none" />
            <button className={`${btnPrimary} mt-5`} disabled={pending} onClick={send}>{pending ? "Asking…" : "Ask"}</button>
            <button className="mt-1 flex h-12 w-full items-center justify-center text-[15px] font-bold text-muted" disabled={pending} onClick={() => setAsk(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
