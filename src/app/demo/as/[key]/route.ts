import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth/session";
import { CAST, castId, FAMILY_CIRCLE_ID, OPERATOR_ID } from "@/lib/demo/cast";

export const runtime = "nodejs";

/** Judge panel "see it as": switches the demo session to a cast member and opens their view. Demo mode only. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (process.env.DEMO_MODE !== "true") return new NextResponse("Not found", { status: 404 });
  const { key } = await params;
  const cast = CAST.find((c) => c.key === key);
  const id = key === "analyst" ? OPERATOR_ID : cast ? castId(cast.key) : null;
  if (!id) return new NextResponse("Not found", { status: 404 });
  await setSession(id);
  // Behind Render's proxy req.url is the internal http://localhost:10000, and Next.js turns a relative Location back
  // into that origin. Build the redirect from the public site URL instead (the request URL only as a local fallback).
  const base = process.env.NEXT_PUBLIC_SITE_URL || req.url;
  return NextResponse.redirect(new URL(key === "analyst" ? "/ops" : `/c/${FAMILY_CIRCLE_ID}`, base));
}
