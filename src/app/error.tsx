"use client";
import Link from "next/link";
import { Pebble } from "@/components/pebble";

/** Any page that fails to load. Money never moves from a page render, so this is always safe to retry. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
      <Pebble size={64} state="concerned" />
      <h1 className="text-2xl font-extrabold">That didn&apos;t load.</h1>
      <p className="text-[15px] text-muted">Your money is safe. Nothing moves without you.</p>
      <button onClick={reset} className="mt-2 inline-flex h-13 items-center rounded-[14px] bg-text px-6 text-[15px] font-bold text-white">Try again</button>
      <Link href="/home" className="text-[15px] font-bold text-muted">Back home</Link>
    </main>
  );
}
