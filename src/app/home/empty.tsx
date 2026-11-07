import Link from "next/link";
import { Pebble } from "@/components/pebble";

/** Design GStates "Empty". */
export function NoCircles() {
  return (
    <section className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
      <Pebble size={56} />
      <h3 className="text-lg font-extrabold">No circles yet</h3>
      <p className="max-w-[280px] text-[15px] text-muted">Start one with people you trust, or join with a code.</p>
      <Link href="/join" className="mt-1 text-[15px] font-bold text-accent">I have a code</Link>
    </section>
  );
}
