import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Logo, Pebble } from "@/components/pebble";
import { ComingSoon, WaIcon } from "@/components/whatsapp";
import { proofView } from "@/lib/views/proof";

export const dynamic = "force-dynamic";

/** The Family Circle, as it stands after round 1: Amina has been paid, Ngozi is next. */
const SEATS = [
  { name: "Amina", city: "Kano", state: "paid" },
  { name: "Ngozi", city: "Houston", state: "next" },
  { name: "Tunde", city: "London", state: "in" },
  { name: "Ifeoma", city: "Lagos", state: "in" },
  { name: "Sani", city: "Abuja", state: "in" },
  { name: "Musa", city: "Kano", state: "in" },
] as const;

const ROUND = [
  { title: "Everyone pays in", body: "$51 from each member's PayPal on the due date: $50 for the pot and $1 for protection." },
  { title: "The pot goes out", body: "The full $300 lands in this round's member's PayPal, and PayPal confirms it." },
  { title: "If someone misses", body: "They get 48 hours to pay. After that the pool covers them, so the payout stays full." },
  { title: "They pay it back", body: "A PayPal invoice they can pay in two parts, with no interest. Their score recovers as they pay." },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function liveCounts() {
  try {
    return (await proofView()).counts;
  } catch {
    return null;
  }
}

function Phone({ src, alt, w = 396, h = 832, priority = false, className = "" }: { src: string; alt: string; w?: number; h?: number; priority?: boolean; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[34px] border-[7px] border-[#18181b] bg-white shadow-[0_24px_60px_-20px_rgba(38,33,106,0.45)] ${className}`}>
      <div className="aspect-[396/832] overflow-hidden">
        <Image src={src} alt={alt} width={w} height={h} priority={priority} sizes="(min-width: 1024px) 280px, (min-width: 640px) 40vw, 70vw" className="h-auto w-full" />
      </div>
    </div>
  );
}

function Ring() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]" role="img" aria-label="A savings circle of six members. Amina received $300 this round; Ngozi is next.">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <circle cx="50" cy="50" r="38" fill="#f8f7fd" stroke="#ecebf6" strokeWidth="0.9" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#3b358a" strokeWidth="0.9" strokeLinecap="round" className="ring-draw" transform="rotate(-90 50 50)" />
      </svg>
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
        <Pebble size={78} state="pleased" />
        <span className="num mt-2 font-display text-[34px] leading-none font-semibold tracking-tight">$300</span>
        <span className="mt-1 text-[13px] text-muted">this round&apos;s pot</span>
      </div>
      {SEATS.map((s, i) => {
        const a = ((-90 + i * 60) * Math.PI) / 180;
        const x = 50 + 38 * Math.cos(a);
        const y = 50 + 38 * Math.sin(a);
        return (
          <div key={s.name} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${x}%`, top: `${y}%` }}>
            <span
              className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-full font-display text-[20px] font-semibold ${
                s.state === "paid" ? "bg-paid text-white" : s.state === "next" ? "border-2 border-pebble bg-white text-pebble" : "border border-line bg-white text-text"
              }`}
            >
              {s.name[0]}
              {s.state === "paid" ? (
                <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-text">
                  <Icon name="check" size={11} stroke={3} color="#fff" />
                </span>
              ) : null}
            </span>
            <span className="mt-1.5 flex flex-col items-center rounded-[10px] bg-white px-2 py-0.5 shadow-[0_0_0_4px_#fff]">
              <span className="text-[13px] font-bold leading-tight">{s.name}</span>
              <span className={`text-[11.5px] leading-tight ${s.state === "paid" ? "font-bold text-paid" : s.state === "next" ? "font-bold text-pebble" : "text-muted"}`}>{s.state === "paid" ? "got $300" : s.state === "next" ? "next" : s.city}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default async function Landing() {
  const counts = await liveCounts();
  return (
    <div className="bg-white text-text">
      {/* Top bar */}
      <header className="mx-auto flex max-w-[1120px] items-center justify-between px-5 pt-6 md:px-8">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-5 text-[15px] font-bold">
          <Link href="/proof" className="hidden text-muted no-underline hover:text-text sm:inline">Proof of PayPal</Link>
          <Link href="/login" className="inline-flex h-10 items-center rounded-full bg-text px-5 text-white no-underline">Log in</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-5 pt-14 pb-20 md:px-8 lg:grid-cols-[1.12fr_1fr] lg:pt-20">
        <div>
          <p className="text-[15px] text-muted">For adashe, esusu and ajo circles, at home and abroad.</p>
          <h1 className="mt-4 font-display text-[44px] leading-[1.02] font-semibold tracking-[-0.025em] sm:text-[60px] lg:text-[64px]">
            The savings circle your grandmother trusted.
          </h1>
          <p className="mt-6 max-w-[520px] text-[18px] leading-relaxed text-[#3f3f46]">
            Everyone pays in through PayPal each round and one member takes home the whole pot. If someone misses, a small protection fee keeps the pot full, and every payment lands on a record anyone in the circle can check.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login" className="inline-flex h-14 items-center gap-2 rounded-[16px] bg-pebble px-7 text-[16px] font-bold text-white no-underline shadow-[0_10px_30px_-10px_rgba(59,53,138,0.8)]">
              Open the app
            </Link>
            <Link href="/proof" className="inline-flex h-14 items-center rounded-[16px] border border-line px-6 text-[16px] font-bold text-text no-underline">
              See the real PayPal transactions
            </Link>
          </div>
          {counts && counts.charges > 0 ? (
            <p className="mt-6 flex items-center gap-2 text-[14px] text-muted">
              <Icon name="check" size={16} stroke={2.6} color="var(--paid)" />
              {plural(counts.charges, "contribution")} and {plural(counts.payouts, "payout")} have gone through PayPal&apos;s sandbox, each with PayPal&apos;s own reference.
            </p>
          ) : null}
        </div>
        <Ring />
      </section>

      {/* One round */}
      <section aria-labelledby="round" className="border-y border-line bg-[#fafafb]">
        <div className="mx-auto max-w-[1120px] px-5 py-16 md:px-8">
          <h2 id="round" className="max-w-[560px] font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-[38px]">One round, start to finish</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {ROUND.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2">
                <span className="num font-display text-[15px] font-semibold text-pebble">{i + 1}</span>
                <span className="text-[18px] font-bold">{s.title}</span>
                <span className="text-[15px] leading-relaxed text-muted">{s.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What members see */}
      <section aria-labelledby="see" className="mx-auto max-w-[1120px] px-5 pt-20 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="see" className="max-w-[560px] font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-[38px]">What a member sees</h2>
          <p className="max-w-[420px] text-[15px] text-muted">Real screens from the live app, signed in as Musa from the Family Circle.</p>
        </div>
        <div className="-mx-5 mt-10 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-6 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {[
            { src: "/screens/money.webp", h: 1029, title: "My money", body: "What's due, Pay now with PayPal, when your turn comes, and every payment with its PayPal reference." },
            { src: "/screens/receipt.webp", h: 1072, title: "A receipt for every payment", body: "PayPal's capture ID, proof that PayPal confirmed it, and its place on the ledger. Print it or share it on WhatsApp." },
            { src: "/screens/payout.webp", h: 832, title: "Payday", body: "When the pot lands, the whole circle sees who paid in and that it went out in full." },
          ].map((p, i) => (
            <figure key={p.src} className="w-[70vw] max-w-[300px] shrink-0 snap-center md:w-auto md:max-w-none">
              <Phone src={p.src} alt={p.title} h={p.h} priority={i === 0} />
              <figcaption className="mt-5">
                <span className="block text-[17px] font-bold">{p.title}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-muted">{p.body}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Ledger */}
      <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-5 pt-24 md:grid-cols-[0.8fr_1fr] md:px-8">
        <Phone src="/screens/ledger.webp" alt="The circle's ledger, with every link verified" className="mx-auto w-full max-w-[290px]" />
        <div>
          <h2 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-[38px]">Every payment, on a record nobody can quietly change</h2>
          <p className="mt-5 max-w-[500px] text-[17px] leading-relaxed text-[#3f3f46]">
            Each event in the circle is chained to the one before it. Tap Verify chain and your own phone re-checks every link. Change one old entry and every link after it breaks.
          </p>
          <ul className="mt-6 flex flex-col gap-3 text-[15px]">
            <li className="flex items-start gap-3"><Icon name="check" size={18} stroke={2.6} color="var(--paid)" /> Members see names and amounts, never each other&apos;s PayPal details.</li>
            <li className="flex items-start gap-3"><Icon name="check" size={18} stroke={2.6} color="var(--paid)" /> PayPal&apos;s signed confirmation is checked before anything is recorded.</li>
            <li className="flex items-start gap-3"><Icon name="check" size={18} stroke={2.6} color="var(--paid)" /> Paying on time builds a Circle Score that finally counts.</li>
          </ul>
        </div>
      </section>

      {/* Shugaba */}
      <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-5 pt-24 md:grid-cols-[1fr_0.8fr] md:px-8">
        <div className="md:order-1">
          <h2 className="font-display text-[32px] leading-tight font-semibold tracking-tight sm:text-[38px]">Shugaba answers in English, Pidgin and Hausa</h2>
          <p className="mt-5 max-w-[500px] text-[17px] leading-relaxed text-[#3f3f46]">
            Ask when your turn is or what happens if you&apos;re late. Shugaba answers from your own circle&apos;s records, can offer to split a payment, and helps you swap turns. It can never send money anywhere on its own.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            {[
              ["English", "When is my turn?"],
              ["Pidgin", "Wetin go happen if I no pay on time?"],
              ["Hausa", "Yaushe ne lokacina?"],
            ].map(([lang, q]) => (
              <p key={lang} className="flex items-baseline gap-3 text-[15px]">
                <span className="w-16 shrink-0 text-[13px] font-bold text-muted">{lang}</span>
                <span className="rounded-[14px] rounded-bl-[4px] bg-pebble-soft px-3.5 py-2 text-pebble">{q}</span>
              </p>
            ))}
          </div>
        </div>
        <Phone src="/screens/chat.webp" alt="Shugaba answering when Musa's turn is" className="mx-auto w-full max-w-[290px] md:order-2" />
      </section>

      {/* Proof */}
      <section className="mt-24 bg-[#26216a] text-white">
        <div className="mx-auto grid max-w-[1120px] items-center gap-12 px-5 py-20 md:grid-cols-[1fr_0.75fr] md:px-8">
          <div>
            <h2 className="font-display text-[34px] leading-tight font-semibold tracking-tight sm:text-[42px]">Real PayPal, not a mock-up</h2>
            <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-[#d9d7f2]">
              Contributions are charged to members&apos; saved PayPal, payouts go out with PayPal Payouts, late payers get a real PayPal invoice, and every step is confirmed by a signed PayPal webhook. It runs on PayPal&apos;s sandbox with test money.
            </p>
            {counts ? (
              <dl className="mt-8 grid max-w-[520px] grid-cols-3 gap-6">
                {[
                  [counts.charges, counts.charges === 1 ? "contribution charged" : "contributions charged"],
                  [counts.payouts, counts.payouts === 1 ? "payout confirmed" : "payouts confirmed"],
                  [counts.webhooks, counts.webhooks === 1 ? "webhook verified" : "webhooks verified"],
                ].map(([n, label]) => (
                  <div key={String(label)}>
                    <dt className="sr-only">{label}</dt>
                    <dd className="num font-display text-[40px] leading-none font-semibold">{n}</dd>
                    <dd className="mt-2 text-[14px] text-[#b9b6e6]">{label}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <Link href="/proof" className="mt-10 inline-flex h-14 items-center rounded-[16px] bg-white px-7 text-[16px] font-bold text-[#26216a] no-underline">
              Open Proof of PayPal
            </Link>
          </div>
          <Phone src="/screens/proof.webp" alt="The Proof of PayPal page" className="mx-auto w-full max-w-[280px] border-[#0f0c3a]" />
        </div>
      </section>

      {/* More */}
      <section className="mx-auto max-w-[1120px] px-5 py-20 md:px-8">
        <h2 className="font-display text-[28px] leading-tight font-semibold tracking-tight">Also in Shugaba</h2>
        <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-3">
          <div>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pebble-soft"><Icon name="swap" size={20} color="var(--pebble)" /></span>
            <p className="mt-4 text-[17px] font-bold">Swap turns</p>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">Need the money sooner? Your agent finds someone willing to swap, within limits you set, and you both sign.</p>
          </div>
          <div>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pebble-soft"><Icon name="shield" size={20} color="var(--pebble)" /></span>
            <p className="mt-4 text-[17px] font-bold">Protection you can see</p>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">The fee is 1 to 3% depending on the circle. Three quarters stays in your circle&apos;s pool; the rest backs every circle.</p>
          </div>
          <div>
            <WaIcon size={44} />
            <p className="mt-4 flex items-center gap-2 text-[17px] font-bold">WhatsApp alerts <ComingSoon /></p>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">Reminders, receipts and payout messages where your circle already talks. Sharing invites and receipts works today.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-6 px-5 py-10 md:px-8">
          <div className="flex flex-col gap-2">
            <Logo size={24} />
            <span className="text-[13px] text-muted">Built for the PayPal AI hackathon. Runs on PayPal&apos;s sandbox with test money.</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-5 text-[14px] font-bold">
            <Link href="/login" className="text-text no-underline">Log in</Link>
            <Link href="/proof" className="text-text no-underline">Proof of PayPal</Link>
            <Link href="/privacy" className="text-text no-underline">Privacy</Link>
            <Link href="/terms" className="text-text no-underline">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
