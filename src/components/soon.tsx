import { Pebble } from "./pebble";
import { BackBar } from "./ui/top-bar";

/** Placeholder for a screen that lands in a later milestone. */
export function Soon({ back, title }: { back: string; title: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <BackBar href={back} title={title} />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center rise">
        <Pebble size={64} />
        <p className="text-[15px] text-muted">This screen is on its way.</p>
      </main>
    </div>
  );
}
