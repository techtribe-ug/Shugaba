import { currentMember } from "@/lib/auth/session";
import { isMember } from "@/lib/views/circle";
import { ledgerView } from "@/lib/views/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/circles/:id/ledger: events in order. Members get names; everyone else initials (`?public=1`). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentMember();
  const asMember = !new URL(req.url).searchParams.has("public") && !!me && (await isMember(id, me.id));
  const v = await ledgerView(id, asMember ? "member" : "public");
  if (!v) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ circle: v.circle, totals: v.totals, events: v.chain, rows: v.rows });
}
