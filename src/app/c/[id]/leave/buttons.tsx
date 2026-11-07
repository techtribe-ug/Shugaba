"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { leaveAction } from "@/app/actions";
import { btnPrimary } from "@/components/ui/top-bar";

export function LeaveButtons({ circleId, label }: { circleId: string; label: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-auto flex flex-col gap-1 pt-8">
      {error ? <p role="alert" className="pb-2 text-sm text-failed">{error}</p> : null}
      <Link href={`/c/${circleId}`} className={`${btnPrimary} no-underline`}>Stay in the circle</Link>
      {label ? (
        <button
          disabled={pending}
          className="flex h-13 items-center justify-center text-[15px] font-bold text-failed"
          onClick={() =>
            start(async () => {
              const r = await leaveAction(circleId);
              if (!r.ok) return setError(r.error);
              if (r.approvalUrl) window.location.href = r.approvalUrl;
              else router.push("/home");
            })
          }
        >
          {pending ? "Leaving…" : label}
        </button>
      ) : null}
    </div>
  );
}
