import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth/session";
import { memberForPayPal, paypalIdentity, site } from "@/lib/auth/paypal-login";

export const runtime = "nodejs";

/** PayPal sends the person back here: check state, learn who they are, sign them in. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("lipp_state")?.value;
  const next = jar.get("lipp_next")?.value ?? "/home";
  jar.delete("lipp_state");
  jar.delete("lipp_next");
  const fail = (why: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(why)}`, site()));
  if (url.searchParams.get("error")) return fail("paypal-cancelled");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return fail("paypal-state");
  try {
    const who = await paypalIdentity(code);
    const memberId = await memberForPayPal(who);
    await setSession(memberId);
    return NextResponse.redirect(new URL(next, site()));
  } catch (e) {
    console.error("[login] PayPal sign-in failed", e);
    return fail("paypal-failed");
  }
}
