import { eq, or, sql } from "drizzle-orm";
import { encryptPrivateKey, generateSigningKeys } from "@/lib/crypto/sign";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";

/**
 * Log in with PayPal (OAuth 2 / OpenID Connect).
 * VERIFY: https://developer.paypal.com/docs/log-in-with-paypal/integrate/ (connect URL, authorization_code grant,
 * /v1/identity/oauth2/userinfo). Requires "Log in with PayPal" + a Return URL on the PayPal app.
 */
const apiBase = () => process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
const webBase = () => (apiBase().includes("sandbox") ? "https://www.sandbox.paypal.com" : "https://www.paypal.com");
export const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const callbackUrl = () => `${site()}/login/paypal/callback`;

export function paypalLoginEnabled() {
  return !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
}

export function authorizeUrl(state: string) {
  const q = new URLSearchParams({
    flowEntry: "static",
    client_id: process.env.PAYPAL_CLIENT_ID!,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: callbackUrl(),
    state,
  });
  return `${webBase()}/connect?${q.toString()}`;
}

type UserInfo = { user_id?: string; sub?: string; name?: string; given_name?: string; email?: string; emails?: { value: string; primary?: boolean }[] };

/** Code → access token → who the person is at PayPal. */
export async function paypalIdentity(code: string): Promise<{ payerId: string | null; email: string; name: string }> {
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const tok = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code }).toString(),
  });
  if (!tok.ok) throw new Error(`PayPal token exchange failed (${tok.status})`);
  const { access_token } = (await tok.json()) as { access_token: string };
  const ui = await fetch(`${apiBase()}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!ui.ok) throw new Error(`PayPal userinfo failed (${ui.status})`);
  const u = (await ui.json()) as UserInfo;
  const email = u.email ?? u.emails?.find((e) => e.primary)?.value ?? u.emails?.[0]?.value;
  if (!email) throw new Error("PayPal did not share an email address; enable Email under Log in with PayPal");
  return { payerId: u.user_id ?? u.sub ?? null, email: email.toLowerCase(), name: u.given_name ?? u.name?.split(" ")[0] ?? email.split("@")[0]! };
}

/** The member this PayPal account belongs to (by PayPal email or sign-in email), created on first sign-in. */
export async function memberForPayPal(who: { email: string; name: string }): Promise<string> {
  const d = db();
  const [found] = await d
    .select({ id: s.members.id })
    .from(s.members)
    .where(or(sql`lower(${s.members.paypalEmail}) = ${who.email}`, sql`lower(${s.members.email}) = ${who.email}`))
    .limit(1);
  if (found) return found.id;
  const keys = generateSigningKeys();
  const id = uuidv7();
  await d.insert(s.members).values({
    id,
    name: who.name,
    email: who.email,
    country: "US",
    language: "en",
    paypalEmail: who.email,
    publicKey: keys.publicKey,
    privateKeyEnc: encryptPrivateKey(keys.privateKey),
  });
  return id;
}

export async function memberName(id: string) {
  const [m] = await db().select({ name: s.members.name }).from(s.members).where(eq(s.members.id, id));
  return m?.name ?? null;
}
