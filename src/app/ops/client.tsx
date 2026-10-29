"use client";
import { useState, useTransition } from "react";
import { logout } from "@/app/actions";
import { askAnalyst, resumeCircleAction, reviewFlagAction, type AnalystAnswer } from "./actions";

const btn = "h-10 rounded-[10px] px-4 text-sm font-extrabold disabled:opacity-50";
const PRESETS = ["Which circles have pool coverage below 2 payouts?", "Show recoveries", "Which members defaulted in more than one circle?", "Show fraud flags"];

/** Every money decision from /ops needs a reason note (spec 4.2.7). */
function useReasoned() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: (reason: string) => Promise<{ ok: boolean; error?: string }>, ask: string) => {
    const reason = window.prompt(ask);
    if (!reason) return;
    start(async () => {
      const r = await fn(reason);
      setError(r.ok ? null : (r.error ?? "That did not work."));
    });
  };
  return { pending, error, run };
}

export function HeldActions({ flagId, circleId }: { flagId: string | null; circleId: string }) {
  const { pending, error, run } = useReasoned();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button className={`${btn} bg-text text-white`} disabled={pending} onClick={() => run((r) => (flagId ? reviewFlagAction(flagId, "CLEARED", r) : resumeCircleAction(circleId, r)), "Why is it safe to release? (logged)")}>Release</button>
        {flagId ? <button className={`${btn} text-text`} disabled={pending} onClick={() => run((r) => reviewFlagAction(flagId, "CONFIRMED", r), "Why keep holding? (logged)")}>Keep holding</button> : null}
      </div>
      {error ? <span role="alert" className="text-xs text-failed">{error}</span> : null}
    </div>
  );
}

export function FlagActions({ flagId }: { flagId: string }) {
  const { pending, error, run } = useReasoned();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button className={`${btn} border border-line`} disabled={pending} onClick={() => run((r) => reviewFlagAction(flagId, "CLEARED", r), "Why clear this flag? (logged)")}>Clear</button>
        <button className={`${btn} bg-failed text-white`} disabled={pending} onClick={() => run((r) => reviewFlagAction(flagId, "CONFIRMED", r), "Why confirm fraud? (logged)")}>Confirm</button>
      </div>
      {error ? <span role="alert" className="text-xs text-failed">{error}</span> : null}
    </div>
  );
}

export function Analyst() {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [answer, setAnswer] = useState<AnalystAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = (question: string) => {
    setQ(question);
    start(async () => {
      const r = await askAnalyst(question);
      if ("error" in r) return setError(r.error);
      setError(null);
      setAnswer(r);
    });
  };
  const cols = answer?.rows[0] ? Object.keys(answer.rows[0]) : [];
  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => (e.preventDefault(), ask(q))} className="flex items-center gap-2">
        <label htmlFor="ask" className="sr-only">Ask Shugaba about your circles</label>
        <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about any circle" className="h-12 min-w-0 flex-1 border-b-[1.5px] border-text bg-transparent text-base outline-none" />
        <button className={`${btn} h-12 bg-text text-white`} disabled={pending || q.trim().length < 3}>{pending ? "…" : "Ask"}</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => ask(p)} aria-pressed={q === p} className="h-9 rounded-full border border-line px-3.5 text-[13px] font-bold aria-pressed:bg-text aria-pressed:text-white">{p}</button>
        ))}
      </div>
      {error ? <p role="alert" className="text-sm text-failed">{error}</p> : null}
      {answer ? (
        <div aria-live="polite" className="flex flex-col gap-2 rounded-[16px] border border-line p-4">
          <span className="text-[15px]"><b className="num">{answer.rows.length}</b> · {answer.spec.title}</span>
          {answer.rows.length ? (
            <div className="overflow-x-auto">
              <table className="num w-full text-left text-[13px]">
                <thead className="text-[#A1A1AA]"><tr>{cols.map((c) => <th key={c} className="py-1.5 pr-4 font-bold">{c}</th>)}</tr></thead>
                <tbody>{answer.rows.map((r, i) => <tr key={i} className="border-t border-surface">{cols.map((c) => <td key={c} className="py-2 pr-4">{r[c]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ) : <span className="text-sm text-muted">Nothing matches.</span>}
        </div>
      ) : null}
    </div>
  );
}

export function LogoutLink() {
  return <form action={logout}><button className="text-sm font-bold text-muted">Log out</button></form>;
}
