import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { members } from "@/lib/db/schema";

export const SESSION_COOKIE = "shg_session";
const MAX_AGE_S = 7 * 24 * 3600;
/** Money moves need a session younger than this (spec 4.2.4). */
export const STEP_UP_MAX_AGE_MS = 24 * 3600 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ chars) is required in production");
  return "dev-only-session-secret-not-for-production!!";
}

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function encodeSession(memberId: string, issuedAt = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ m: memberId, t: issuedAt })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): { memberId: string; issuedAt: number } | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const { m, t } = JSON.parse(Buffer.from(body, "base64url").toString()) as { m: string; t: number };
    if (typeof m !== "string" || typeof t !== "number" || Date.now() - t > MAX_AGE_S * 1000) return null;
    return { memberId: m, issuedAt: t };
  } catch {
    return null;
  }
}

/** Secure, HttpOnly, SameSite=Lax (spec 4.2.5). */
export async function setSession(memberId: string) {
  (await cookies()).set(SESSION_COOKIE, encodeSession(memberId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession() {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Public member fields only. private_key_enc, vault ids and emails never leave the server. */
export async function currentMember() {
  const s = await getSession();
  if (!s) return null;
  const [m] = await db()
    .select({ id: members.id, name: members.name, language: members.language, circleScore: members.circleScore, isOperator: members.isOperator, country: members.country })
    .from(members)
    .where(eq(members.id, s.memberId));
  return m ? { ...m, sessionIssuedAt: s.issuedAt } : null;
}

export type CurrentMember = NonNullable<Awaited<ReturnType<typeof currentMember>>>;

export function sessionFreshForMoney(m: CurrentMember): boolean {
  return Date.now() - m.sessionIssuedAt < STEP_UP_MAX_AGE_MS;
}
