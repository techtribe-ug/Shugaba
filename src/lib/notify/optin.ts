import { and, eq } from "drizzle-orm";
import { db as getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { stableId } from "@/lib/ids";

export const E164 = /^\+[1-9]\d{7,14}$/;

export async function whatsAppChannel(memberId: string) {
  const [ch] = await getDb().select().from(s.notificationChannels).where(and(eq(s.notificationChannels.memberId, memberId), eq(s.notificationChannels.channel, "whatsapp")));
  return ch ?? null;
}

/** Opt in with a number, or opt out (phone null). Explicit opt-in only (spec 10.9). */
export async function setWhatsApp(memberId: string, phone: string | null, source: string) {
  const now = new Date();
  const id = stableId(`whatsapp:${memberId}`);
  const existing = await whatsAppChannel(memberId);
  if (phone === null) {
    if (existing) await getDb().update(s.notificationChannels).set({ optedOutAt: now, updatedAt: now }).where(eq(s.notificationChannels.id, existing.id));
    return;
  }
  if (!E164.test(phone)) throw new Error("bad phone");
  if (existing) await getDb().update(s.notificationChannels).set({ phoneE164: phone, optedInAt: now, optedOutAt: null, optInSource: source, updatedAt: now }).where(eq(s.notificationChannels.id, existing.id));
  else await getDb().insert(s.notificationChannels).values({ id, memberId, channel: "whatsapp", phoneE164: phone, optedInAt: now, optInSource: source });
}

/** Inbound STOP / START from WhatsApp, matched by phone number. */
export async function handleInboundKeyword(phone: string, text: string) {
  const word = text.trim().toUpperCase();
  const now = new Date();
  const set = word === "STOP" ? { optedOutAt: now } : word === "START" ? { optedOutAt: null, optedInAt: now } : {};
  await getDb().update(s.notificationChannels).set({ ...set, lastInboundAt: now, updatedAt: now }).where(and(eq(s.notificationChannels.channel, "whatsapp"), eq(s.notificationChannels.phoneE164, phone)));
}
