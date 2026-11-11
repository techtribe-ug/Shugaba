import Link from "next/link";
import { Logo, Pebble } from "@/components/pebble";
import { ComingSoon, WaIcon } from "@/components/whatsapp";

const PILLARS = [
  ["No one holds the money", "Contributions go through PayPal. Payouts go out on time, by themselves."],
  ["Protected", "A small fee guarantees a full payout, even if someone misses."],
  ["Shugaba runs it", "Reminders and answers in English, Pidgin and Hausa."],
  ["Swap turns", "Need money sooner? Your agent finds someone to swap with."],
  ["A record that counts", "Paying on time builds your Circle Score."],
] as const;

export default function Landing() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10 rise">
      <Logo />
      <section className="mt-16 flex flex-col items-center text-center">
        <Pebble size={120} />
        <h1 className="mt-8 font-display text-4xl font-semibold leading-tight">
          The savings circle your grandmother trusted.
        </h1>
        <p className="mt-3 text-muted">With a guarantee that you get paid, and a record that finally counts.</p>
        <Link
          href="/judge"
          className="mt-8 inline-flex h-12 items-center rounded-[var(--radius)] bg-text px-6 font-medium text-white"
        >
          Try the demo
        </Link>
        <Link href="/login" className="mt-3 inline-flex h-12 items-center rounded-[var(--radius)] border border-line px-6 font-medium text-text no-underline">
          Log in
        </Link>
        <Link href="/proof" className="mt-4 text-[15px] font-bold text-accent">
          See the real PayPal transactions
        </Link>
      </section>
      <ol className="mt-16 divide-y divide-line border-y border-line">
        {PILLARS.map(([title, body]) => (
          <li key={title} className="py-4">
            <p className="font-display text-lg font-medium">{title}</p>
            <p className="text-sm text-muted">{body}</p>
          </li>
        ))}
        <li className="flex items-center gap-3 py-4">
          <WaIcon size={32} />
          <span className="flex flex-1 flex-col">
            <span className="font-display text-lg font-medium">On WhatsApp</span>
            <span className="text-sm text-muted">Reminders, receipts and payout alerts where you already chat.</span>
          </span>
          <ComingSoon />
        </li>
      </ol>
    </main>
  );
}
