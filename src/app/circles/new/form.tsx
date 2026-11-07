"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCircleAction } from "@/app/actions";
import { Icon } from "@/components/icons";
import { Pebble } from "@/components/pebble";
import { btnPrimary } from "@/components/ui/top-bar";
import { formatCents } from "@/lib/protocol";

const FREQ = [
  ["WEEKLY", "Weekly", "week"],
  ["MONTHLY", "Monthly", "month"],
] as const;
const TIERS = [
  ["BASIC", "Basic", "Covers 1 missed payment"],
  ["STANDARD", "Standard", "Covers 1 missed payment, plus the reserve"],
  ["PLUS", "Plus", "Covers 2 missed payments, plus the reserve"],
] as const;

/** Create circle (design: GCreate). Live fee preview from the same bps the treasury uses. */
export function CreateForm({ feeBps }: { feeBps: Record<"BASIC" | "STANDARD" | "PLUS", number> }) {
  const router = useRouter();
  const [amount, setAmount] = useState(5000);
  const [size, setSize] = useState(6);
  const [freq, setFreq] = useState<(typeof FREQ)[number][0]>("MONTHLY");
  const [tier, setTier] = useState<(typeof TIERS)[number][0]>("STANDARD");
  const [name, setName] = useState("My circle");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fee = (t: keyof typeof feeBps) => Math.floor((amount * feeBps[t]) / 10000);
  const per = FREQ.find((f) => f[0] === freq)![2];

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pt-4 pb-7 rise">
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-[#A1A1AA]">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="h-11 border-b border-line text-lg font-bold outline-none focus:border-text" />
      </label>
      <section aria-label="Amount" className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-[#A1A1AA]">Each person puts in</span>
        <div className="flex items-center gap-3.5">
          <button type="button" onClick={() => setAmount((a) => Math.max(1000, a - 1000))} aria-label="Less" className="h-11 w-11 rounded-full bg-surface text-[22px] font-bold">−</button>
          <span aria-live="polite" className="num flex-1 text-center text-[64px] font-bold leading-none tracking-tighter">{formatCents(amount)}</span>
          <button type="button" onClick={() => setAmount((a) => Math.min(50000, a + 1000))} aria-label="More" className="h-11 w-11 rounded-full bg-surface text-[22px] font-bold">+</button>
        </div>
      </section>
      <section className="flex flex-col">
        <div className="flex items-center justify-between border-t border-surface py-3.5">
          <span className="text-[15px] text-[#52525B]">People</span>
          <span className="flex gap-[18px]">
            {[4, 6, 8, 10].map((n) => (
              <button key={n} type="button" aria-pressed={n === size} onClick={() => setSize(n)} className={`num h-8 border-b-2 text-[17px] font-bold ${n === size ? "border-text text-text" : "border-transparent text-[#A1A1AA]"}`}>{n}</button>
            ))}
          </span>
        </div>
        <div className="flex items-center justify-between border-y border-surface py-3.5">
          <span className="text-[15px] text-[#52525B]">How often</span>
          <span className="flex gap-[18px]">
            {FREQ.map(([v, label]) => (
              <button key={v} type="button" aria-pressed={v === freq} onClick={() => setFreq(v)} className={`h-8 border-b-2 text-[15px] font-bold ${v === freq ? "border-text text-text" : "border-transparent text-[#A1A1AA]"}`}>{label}</button>
            ))}
          </span>
        </div>
      </section>
      <section aria-label="Protection" className="flex flex-col">
        <span className="flex items-center gap-2 pb-1.5 text-[13px] font-bold text-[#A1A1AA]">
          <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent"><Icon name="shield" size={11} stroke={2.6} color="#fff" /></span>
          Protection
        </span>
        {TIERS.map(([v, label, covers]) => (
          <button key={v} type="button" aria-pressed={v === tier} onClick={() => setTier(v)} className="flex items-center gap-3 border-t border-surface py-3 text-left">
            <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full ${v === tier ? "bg-text" : "border-[1.5px] border-[#D4D4D8]"}`}>
              {v === tier ? <Icon name="check" size={13} stroke={3.4} color="#fff" /> : null}
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">{label}</span>
              <span className="text-[13px] text-muted">{covers}</span>
            </span>
            <span className="num text-[15px] font-bold">{formatCents(fee(v))} each</span>
          </button>
        ))}
      </section>
      <div className="mt-auto flex items-start gap-2.5">
        <Pebble size={26} state="pleased" />
        <p aria-live="polite" className="text-[15px] leading-snug">
          Each person pays <span className="num font-bold">{formatCents(amount + fee(tier))}</span> a {per}. One person gets <span className="num font-bold">{formatCents(amount * size)}</span> each {per}, {size} turns in all.
        </p>
      </div>
      {error ? <p role="alert" className="text-sm text-failed">{error}</p> : null}
      <button
        className={btnPrimary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createCircleAction({ name, contributionAmount: amount, size, frequency: freq, protectionTier: tier, graceHours: 48 });
            if (r.ok && r.id) router.push(`/c/${r.id}`);
            else if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "Creating…" : "Create circle"}
      </button>
    </main>
  );
}
