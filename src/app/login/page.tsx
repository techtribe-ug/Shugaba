import Link from "next/link";
import { redirect } from "next/navigation";
import { Pebble } from "@/components/pebble";
import { Avatar } from "@/components/avatar";
import { currentMember } from "@/lib/auth/session";
import { CAST, castId, OPERATOR_ID } from "@/lib/demo/cast";
import { levelFor } from "@/lib/protocol";
import { demoLogin } from "../actions";
import { paypalLoginEnabled } from "@/lib/auth/paypal-login";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "paypal-cancelled": "PayPal sign-in was cancelled. Nothing changed.",
  "paypal-state": "That sign-in link expired. Please try again.",
  "paypal-failed": "PayPal didn't confirm who you are. Please try again.",
  "paypal-off": "PayPal sign-in isn't set up on this server yet.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (await currentMember()) redirect(next ?? "/home");
  const demo = process.env.DEMO_MODE === "true";
  const magic = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center px-6 pb-8 rise">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-12">
        <Pebble size={96} />
        <span className="font-display text-[52px] font-bold leading-none tracking-tight">shugaba</span>
        <span className="text-center text-[17px] text-muted">Your savings circle, looked after.</span>
      </div>
      {error && ERRORS[error] ? <p role="alert" className="mb-3 w-full rounded-[12px] bg-surface px-4 py-3 text-[15px]">{ERRORS[error]}</p> : null}
      {paypalLoginEnabled() ? (
        <a href={`/login/paypal${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="flex h-14 w-full items-center justify-center gap-1.5 rounded-[14px] bg-text text-base font-bold text-white no-underline">
          Continue with <span className="font-extrabold italic">PayPal</span>
        </a>
      ) : null}
      <Link href="/join" className="mt-1 flex h-13 w-full items-center justify-center text-base font-bold text-text no-underline">I have an invite code</Link>
      {demo ? (
        <section aria-label="Log in as" className="mt-6 w-full">
          <p className="pb-2 text-[13px] font-bold text-[#A1A1AA]">Demo: log in as</p>
          <ul className="divide-y divide-surface border-y border-surface">
            {CAST.map((c) => (
              <li key={c.key}>
                <form action={demoLogin.bind(null, castId(c.key), next)}>
                  <button className="flex w-full items-center gap-3 py-3 text-left">
                    <Avatar size={40} levelColor={levelFor(c.score).color} />
                    <span className="flex flex-1 flex-col">
                      <span className="text-[15px] font-bold">{c.name}</span>
                      <span className="text-[13px] text-muted">{c.city} · {levelFor(c.score).title}</span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
            <li>
              <form action={demoLogin.bind(null, OPERATOR_ID, "/ops")}>
                <button className="flex w-full items-center gap-3 py-3 text-left">
                  <Avatar size={40} />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-bold">Treasury analyst</span>
                    <span className="text-[13px] text-muted">Control tower</span>
                  </span>
                </button>
              </form>
            </li>
          </ul>
        </section>
      ) : null}
      {magic ? (
        <Link href="/login/email" className="mt-4 text-[15px] font-bold text-accent">Sign in with email</Link>
      ) : !demo ? (
        <p className="text-sm text-muted">Sign-in is not configured.</p>
      ) : null}
      <Link href="/judge" className="mt-6 text-[15px] font-bold text-muted">Judge panel</Link>
    </main>
  );
}
