import { currentMember } from "@/lib/auth/session";
import { subscribe } from "@/lib/realtime/bus";
import { isMember } from "@/lib/views/circle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSE stream of realtime events for one circle (members only) or all (`*`, demo judge and operators). */
export async function GET(req: Request) {
  const circle = new URL(req.url).searchParams.get("circle") ?? "";
  const me = await currentMember();
  const all = circle === "*";
  if (all) {
    if (process.env.DEMO_MODE !== "true" && !me?.isOperator) return new Response("forbidden", { status: 403 });
  } else if (!me || !(await isMember(circle, me.id))) {
    if (process.env.DEMO_MODE !== "true") return new Response("forbidden", { status: 403 });
  }
  const enc = new TextEncoder();
  let unsub: () => void = () => {};
  let ping: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(enc.encode("retry: 3000\n\n"));
      unsub = subscribe(all ? "*" : circle, (e) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ event: e.event, at: e.at })}\n\n`)));
      ping = setInterval(() => ctrl.enqueue(enc.encode(": ping\n\n")), 25_000);
      req.signal.addEventListener("abort", () => {
        unsub();
        clearInterval(ping);
        try {
          ctrl.close();
        } catch {}
      });
    },
    cancel() {
      unsub();
      clearInterval(ping);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
