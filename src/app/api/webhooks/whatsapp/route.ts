import { NextResponse, type NextRequest } from "next/server";
import { verifyMetaSignature } from "@/lib/notify/channels";
import { handleInboundKeyword } from "@/lib/notify/optin";

export const dynamic = "force-dynamic";

/** Meta webhook verification handshake. */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) return new NextResponse(q.get("hub.challenge") ?? "", { status: 200 });
  return new NextResponse("forbidden", { status: 403 });
}

type Inbound = { entry?: { changes?: { value?: { messages?: { from?: string; type?: string; text?: { body?: string } }[] } }[] }[] };

/** Inbound messages: only STOP and START are acted on. Signed with the app secret. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) return new NextResponse("bad signature", { status: 401 });
  let body: Inbound;
  try {
    body = JSON.parse(raw) as Inbound;
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  for (const e of body.entry ?? [])
    for (const c of e.changes ?? [])
      for (const m of c.value?.messages ?? [])
        if (m.from && m.type === "text" && m.text?.body) await handleInboundKeyword(`+${m.from}`, m.text.body);
  return NextResponse.json({ ok: true });
}
