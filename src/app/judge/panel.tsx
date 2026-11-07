"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { btnPrimary } from "@/components/ui/top-bar";
import { judgeAdvance, judgeFailMusa, judgePayInvoice, judgeReset, judgeSwap, type JudgeResult } from "./actions";

const quiet = "flex h-11 items-center rounded-[12px] border border-line px-4 text-[15px] font-bold text-text disabled:opacity-50";

export function JudgePanel(props: { step: number; nextLabel: string | null; circleId: string; recoveryOpen: boolean; recoveryPaid: number; tradeId: string | null }) {
  const [pending, start] = useTransition();
  const [last, setLast] = useState<JudgeResult | null>(null);
  const act = (fn: () => Promise<JudgeResult>) => () => start(async () => setLast(await fn()));
  const done = props.step >= 10;
  return (
    <section aria-label="Controls" className="mt-10 flex flex-col gap-4">
      <button className={`${btnPrimary} sm:max-w-[360px]`} disabled={pending || done} onClick={act(judgeAdvance)}>
        {pending ? "Working…" : done ? "Circle complete" : `Next: ${props.nextLabel ?? "advance"}`}
      </button>
      <div className="flex flex-wrap gap-2">
        <button className={quiet} disabled={pending} onClick={act(judgeFailMusa)}>Fail Musa&apos;s next payment</button>
        <button className={quiet} disabled={pending || props.step < 5} onClick={act(judgeSwap)}>Tunde asks to swap</button>
        {props.recoveryOpen ? (
          <>
            <button className={quiet} disabled={pending} onClick={act(() => judgePayInvoice(1))}>Musa pays half</button>
            <button className={quiet} disabled={pending || props.recoveryPaid === 0} onClick={act(() => judgePayInvoice(2))}>Musa pays the rest</button>
          </>
        ) : null}
        {props.tradeId ? (
          <Link href={`/c/${props.circleId}/trades/${props.tradeId}`} className={`${quiet} no-underline`}>Open the swap</Link>
        ) : null}
        <Link href={`/verify/${props.circleId}`} target="_blank" className={`${quiet} no-underline`}>Public ledger</Link>
        <button className={`${quiet} text-failed`} disabled={pending} onClick={() => confirm("Reset the demo to the start?") && act(judgeReset)()}>Reset</button>
      </div>
      <p role="status" aria-live="polite" className={`min-h-6 text-[15px] ${last?.ok === false ? "text-failed" : "text-muted"}`}>{last?.message ?? ""}</p>
    </section>
  );
}
