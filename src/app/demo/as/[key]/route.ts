import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth/session";
import { CAST, castId, FAMILY_CIRCLE_ID, OPERATOR_ID } from "@/lib/demo/cast";

export const runtime = "nodejs";

/** Judge panel "see it as": switches the demo session to a cast member and opens their view. Demo mode only. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (process.env.DEMO_MODE !== "true") return new NextResponse("Not found", { status: 404 });
  const { key } = await params;
  const cast = CAST.find((c) => c.key === key);
  const id = key === "analyst" ? OPERATOR_ID : cast ? castId(cast.key) : null;
  if (!id) return new NextResponse("Not found", { status: 404 });
  await setSession(id);
  // Relative redirect: behind Render's proxy req.url is the internal http://localhost:10000, not the public host.
  return new NextResponse(null, { status: 307, headers: { Location: key === "analyst" ? "/ops" : `/c/${FAMILY_CIRCLE_ID}` } });
}
