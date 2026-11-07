"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { joinAction, lateJoinAction } from "@/app/actions";
import { Icon } from "@/components/icons";
import { btnPrimary, PayPalWord } from "@/components/ui/top-bar";

export function JoinButton({ code, full, forming, late = false }: { code: string; full: boolean; forming: boolean; late?: boolean }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!forming || full) return <p className="mt-8 text-[15px] text-muted">This circle is not taking new members.</p>;
  return (
    <>
      <button role="checkbox" aria-checked={agreed} onClick={() => setAgreed((a) => !a)} className="mt-3.5 flex items-center gap-3 py-2 text-[15px] font-bold">
        <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-[7px] ${agreed ? "bg-text" : "border-[1.5px] border-[#D4D4D8]"}`}>
          {agreed ? <Icon name="check" size={14} stroke={3.4} color="#fff" /> : null}
        </span>
        I agree to these rules
      </button>
      <div className="mt-auto flex flex-col gap-1 pt-8">
        {error ? <p role="alert" className="pb-2 text-sm text-failed">{error}</p> : null}
        <button
          className={btnPrimary}
          disabled={!agreed || pending}
          title={agreed ? undefined : "Tick I agree first"}
          onClick={() =>
            start(async () => {
              const r = await (late ? lateJoinAction : joinAction)(code, agreed);
              if (!r.ok) return setError(r.error);
              if (r.approvalUrl) window.location.href = r.approvalUrl;
              else router.push(`/c/${r.circleId}`);
            })
          }
        >
          {pending ? "Signing…" : (<>Sign and connect <PayPalWord /></>)}
        </button>
        <Link href="/home" className="flex h-13 items-center justify-center text-[15px] font-bold text-muted no-underline">Not now</Link>
      </div>
    </>
  );
}
