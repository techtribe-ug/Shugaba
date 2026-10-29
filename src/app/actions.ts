"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { CreateCircleInput } from "@/lib/protocol";
import { clearSession, currentMember, sessionFreshForMoney, setSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { members } from "@/lib/db/schema";
import { acceptOrderAndStart, createCircle, EngineError, joinCircle, requestSwap, signTrade } from "@/lib/engine";
import { CAST, castId, OPERATOR_ID } from "@/lib/demo/cast";
import { rateLimit } from "@/lib/security/rate-limit";
import { E164, setWhatsApp } from "@/lib/notify/optin";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  if (e instanceof EngineError) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: "Please check the details and try again." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

async function requireMember() {
  const me = await currentMember();
  if (!me) redirect("/login");
  return me;
}

const demoIds = new Set([...CAST.map((c) => castId(c.key)), OPERATOR_ID]);

/** Demo "log in as" (spec 12). Only seeded demo members, only in demo mode. */
export async function demoLogin(memberId: string, next?: string) {
  if (process.env.DEMO_MODE !== "true") throw new Error("demo login is off");
  const id = z.string().min(1).parse(memberId);
  if (!demoIds.has(id)) throw new Error("not a demo member");
  const [m] = await db().select({ id: members.id }).from(members).where(eq(members.id, id));
  if (!m) throw new Error("run the seed first");
  await setSession(id);
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
}

export async function logout() {
  await clearSession();
  redirect("/");
}

export async function createCircleAction(input: unknown): Promise<ActionResult & { id?: string }> {
  const me = await requireMember();
  try {
    await rateLimit(`money:${me.id}`, 10, 60);
    const parsed = CreateCircleInput.parse(input);
    const { id } = await createCircle(me.id, parsed);
    revalidatePath("/home");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function joinAction(code: string, agreed: boolean): Promise<ActionResult & { approvalUrl?: string | null; circleId?: string }> {
  const me = await requireMember();
  try {
    if (!agreed) return { ok: false, error: "Tick I agree first." };
    await rateLimit(`money:${me.id}`, 10, 60);
    const c = z.string().trim().min(4).max(32).parse(code);
    const cast = CAST.find((x) => castId(x.key) === me.id);
    const r = await joinCircle(me.id, c, { prefs: cast?.prefs });
    return { ok: true, approvalUrl: r.approvalUrl, circleId: r.circleId };
  } catch (e) {
    return fail(e);
  }
}

export async function startCircleAction(circleId: string): Promise<ActionResult> {
  const me = await requireMember();
  try {
    await acceptOrderAndStart(z.string().min(1).parse(circleId), me.id);
    revalidatePath(`/c/${circleId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Confirm tap on a swap card (spec 4.2.4: money moves need a fresh session and an explicit tap). */
export async function signTradeAction(tradeId: string): Promise<ActionResult> {
  const me = await requireMember();
  if (!sessionFreshForMoney(me)) return { ok: false, error: "Please sign in again to confirm money moves." };
  try {
    await rateLimit(`money:${me.id}`, 10, 60);
    const r = await signTrade(z.string().min(1).parse(tradeId), me.id);
    return { ok: true, message: r.confirmed ? "Swap confirmed." : "Signed. Waiting for the other member." };
  } catch (e) {
    return fail(e);
  }
}

/** Calendar: the member asks for an earlier turn (drag onto it, or the button on that turn). */
export async function requestSwapAction(circleId: string, targetSeq: number | null, reason: string): Promise<ActionResult & { tradeId?: string; agreed?: boolean }> {
  const me = await requireMember();
  try {
    await rateLimit(`money:${me.id}`, 10, 60);
    const input = z.object({ circleId: z.string().min(1), targetSeq: z.number().int().positive().nullable(), reason: z.string().trim().min(1).max(280) }).parse({ circleId, targetSeq, reason });
    const r = await requestSwap({ circleId: input.circleId, memberId: me.id, reason: input.reason, targetSeq: input.targetSeq ?? undefined });
    revalidatePath(`/c/${input.circleId}`, "layout");
    return { ok: true, tradeId: r.tradeId, agreed: r.agreed, message: r.agreed ? "An agent agreed. Check the terms and sign." : "No one could swap within their limits right now." };
  } catch (e) {
    return fail(e);
  }
}

/** WhatsApp notices: opt in with a number, or turn them off (spec 10.9). */
export async function setWhatsAppAction(phone: string | null): Promise<ActionResult> {
  const me = await requireMember();
  const clean = phone === null ? null : phone.replace(/[\s()-]/g, "");
  if (clean !== null && !E164.test(clean)) return { ok: false, error: "Use the full number with country code, like +234 803 123 4567." };
  try {
    await setWhatsApp(me.id, clean, "settings");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
