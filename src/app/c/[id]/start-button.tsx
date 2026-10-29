"use client";
import { useState, useTransition } from "react";
import { startCircleAction } from "@/app/actions";
import { btnPrimary } from "@/components/ui/top-bar";

export function StartButton({ circleId, ready }: { circleId: string; ready: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex w-full flex-col gap-2">
      <button
        className={`${btnPrimary} w-full`}
        disabled={!ready || pending}
        title={ready ? undefined : "Everyone must join and connect PayPal first"}
        onClick={() =>
          start(async () => {
            const r = await startCircleAction(circleId);
            setError(r.ok ? null : r.error);
          })
        }
      >
        {pending ? "Starting…" : "Accept order and start"}
      </button>
      {error ? <p role="alert" className="text-sm text-failed">{error}</p> : null}
    </div>
  );
}
