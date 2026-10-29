import { Pebble } from "@/components/pebble";

export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" className="flex min-h-dvh items-center justify-center">
      <span className="animate-pulse">
        <Pebble size={48} state="thinking" />
      </span>
    </main>
  );
}
