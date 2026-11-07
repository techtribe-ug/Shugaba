"use client";
import { useEffect, useState } from "react";

/** Design GStates "Offline": a quiet bar, never a blocking screen. */
export function OfflineBar() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-50 bg-text px-4 py-2.5 text-center text-sm font-bold text-white">
      You&apos;re offline. Your money is safe; I&apos;ll catch up when you&apos;re back.
    </div>
  );
}
