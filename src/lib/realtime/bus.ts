import { EventEmitter } from "node:events";
import { circleChannel, type RealtimeEvent, type RealtimeEventName } from "@/lib/protocol";

/**
 * Realtime fan-out. The worker runs in the same process as the web server, so an in-process bus
 * feeds the SSE stream with zero keys. When Supabase is configured, events are also broadcast on
 * the private channel `circle:<id>` (spec 6.5).
 */
const g = globalThis as unknown as { __shugabaBus?: EventEmitter };
export const bus: EventEmitter = g.__shugabaBus ?? (g.__shugabaBus = new EventEmitter().setMaxListeners(500));

export async function publish(circleId: string, event: RealtimeEventName, extra: { ids?: string[]; ledgerSeq?: number } = {}) {
  const payload: RealtimeEvent = { event, circleId, ids: extra.ids ?? [], ledgerSeq: extra.ledgerSeq, at: new Date().toISOString() };
  bus.emit(circleChannel(circleId), payload);
  bus.emit("*", payload);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    // Supabase Realtime REST broadcast. Fire and forget: the UI also refetches on focus.
    // VERIFY: https://supabase.com/docs/guides/realtime/broadcast#broadcast-using-the-rest-api
    fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: circleChannel(circleId), event, payload, private: true }] }),
    }).catch(() => {});
  }
}

export function subscribe(circleId: string | "*", fn: (e: RealtimeEvent) => void): () => void {
  const ch = circleId === "*" ? "*" : circleChannel(circleId);
  bus.on(ch, fn);
  return () => bus.off(ch, fn);
}
