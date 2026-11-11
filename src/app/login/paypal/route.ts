import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeUrl, paypalLoginEnabled, site } from "@/lib/auth/paypal-login";

export const runtime = "nodejs";

/** "Continue with PayPal": send the person to PayPal's sign-in, with a one-time state to check on return. */
export async function GET(req: Request) {
  if (!paypalLoginEnabled()) return NextResponse.redirect(new URL("/login?error=paypal-off", site()));
  const next = new URL(req.url).searchParams.get("next");
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  jar.set("lipp_state", state, opts);
  if (next && next.startsWith("/") && !next.startsWith("//")) jar.set("lipp_next", next, opts);
  return NextResponse.redirect(authorizeUrl(state));
}
