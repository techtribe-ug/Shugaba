"use client";
import { useState } from "react";
import { verifyChain, type ChainedEvent } from "@/lib/treasury/ledger";
import { Icon } from "./icons";

/** Recomputes every hash in the browser with Web Crypto (spec 6.4) and fills a bar as it goes. */
export function VerifyChain({ events, compact = false }: { events: ChainedEvent[]; compact?: boolean }) {
  const [state, setState] = useState<{ phase: "idle" | "running" | "ok" | "broken"; done: number; broken?: number }>({ phase: "idle", done: 0 });
  async function run() {
    setState({ phase: "running", done: 0 });
    const res = await verifyChain(events, (i) => setState((s) => ({ ...s, done: i + 1 })));
    setState(res.ok ? { phase: "ok", done: events.length } : { phase: "broken", done: 0, broken: res.brokenSeq });
  }
  const pct = events.length ? Math.round((state.done / events.length) * 100) : 0;
  return (
    <section aria-label="Check" className="flex flex-col gap-3.5">
      <div className="flex min-h-14 items-center gap-5">
        {state.phase === "ok" ? (
          <>
            <span role="status" className="flex items-center gap-2.5 text-xl font-extrabold text-paid">
              <Icon name="check" stroke={3} /> {compact ? `All ${events.length} match.` : `All ${events.length} match. Nothing was changed.`}
            </span>
            <button onClick={() => setState({ phase: "idle", done: 0 })} className="h-10 text-sm font-bold text-[#A1A1AA]">Check again</button>
          </>
        ) : state.phase === "broken" ? (
          <span role="alert" className="text-lg font-extrabold text-failed">Entry #{state.broken} does not match.</span>
        ) : (
          <>
            <button onClick={run} disabled={state.phase === "running"} className="h-14 shrink-0 whitespace-nowrap rounded-[14px] bg-text px-[30px] text-base font-extrabold text-white disabled:opacity-60">
              {state.phase === "running" ? "Checking…" : compact ? "Verify chain" : "Check the ledger"}
            </button>
            {!compact ? <span className="text-sm text-muted">Recomputes all {events.length} entries in your browser.</span> : null}
          </>
        )}
      </div>
      <span aria-hidden className="block h-[3px] overflow-hidden rounded-sm bg-surface">
        <span className="block h-full bg-paid transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </span>
    </section>
  );
}
