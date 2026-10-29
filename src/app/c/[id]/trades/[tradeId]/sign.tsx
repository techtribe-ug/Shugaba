"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signTradeAction } from "@/app/actions";
import { btnPrimary } from "@/components/ui/top-bar";

export function SignTrade({ tradeId, circleId }: { tradeId: string; circleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error ? <p role="alert" className="pb-2 text-sm text-failed">{error}</p> : null}
      <button
        className={btnPrimary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await signTradeAction(tradeId);
            if (!r.ok) return setError(r.error);
            router.refresh();
          })
        }
      >
        {pending ? "Signing…" : "Sign the swap"}
      </button>
      <Link href={`/c/${circleId}`} className="flex h-13 items-center justify-center text-[15px] font-bold text-muted no-underline">Decline</Link>
    </>
  );
}
