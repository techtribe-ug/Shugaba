"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refetches the page whenever the circle changes (server-sent events from the in-process bus). */
export function LiveRefresh({ circleId }: { circleId: string | "*" }) {
  const router = useRouter();
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const es = new EventSource(`/api/events?circle=${encodeURIComponent(circleId)}`);
    es.onmessage = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => router.refresh(), 150);
    };
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      es.close();
      window.removeEventListener("focus", onFocus);
      if (t) clearTimeout(t);
    };
  }, [circleId, router]);
  return null;
}
