import { z } from "zod";
import { storeWebhook } from "@/lib/engine/webhooks";
import { getPaymentProvider } from "@/lib/paypal";
import { enqueueWebhook } from "@/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Event = z.object({ id: z.string().min(1), event_type: z.string().min(1), resource: z.record(z.string(), z.unknown()), create_time: z.string().optional() }).loose();

/** Spec 7.4: verify, dedup, enqueue, return 200. Bad signature: 400 and log. */
export async function POST(req: Request) {
  const raw = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  let parsed: z.infer<typeof Event>;
  try {
    parsed = Event.parse(JSON.parse(raw));
  } catch {
    return Response.json({ error: "bad payload" }, { status: 400 });
  }
  const verified = await getPaymentProvider().verifyWebhook(headers, raw).catch(() => false);
  if (!verified) {
    console.warn(`[webhook] rejected bad signature for ${parsed.id} (${parsed.event_type})`);
    return Response.json({ error: "bad signature" }, { status: 400 });
  }
  const fresh = await storeWebhook({ id: parsed.id, type: parsed.event_type, resource: parsed.resource, createdAt: parsed.create_time ?? new Date().toISOString() }, true);
  if (fresh) await enqueueWebhook(parsed.id);
  return Response.json({ ok: true, duplicate: !fresh });
}
