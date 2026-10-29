import Link from "next/link";
import { Pebble } from "@/components/pebble";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
      <Pebble size={64} state="thinking" />
      <h1 className="text-2xl font-extrabold">I can&apos;t find that.</h1>
      <p className="text-[15px] text-muted">The link may be old, or the circle isn&apos;t yours.</p>
      <Link href="/home" className="text-[15px] font-bold text-accent">Back home</Link>
    </main>
  );
}
