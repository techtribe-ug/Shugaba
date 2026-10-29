import Link from "next/link";
import { Pebble } from "@/components/pebble";

export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
      <Pebble size={64} state="guarding" />
      <h1 className="text-2xl font-extrabold">Operators only.</h1>
      <Link href="/home" className="text-[15px] font-bold text-accent">Back home</Link>
    </main>
  );
}
