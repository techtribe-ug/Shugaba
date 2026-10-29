import { asc, eq } from "drizzle-orm";
import { narrate } from "@/lib/agents/narrate";
import { db } from "@/lib/db/client";
import { readChain } from "@/lib/db/ledger";
import * as s from "@/lib/db/schema";

/**
 * A circle's chain plus a readable line per entry. Public mode (spec 6.4, 4.2.10) shows initials only;
 * the chain itself holds ids and amounts, never emails or PayPal references.
 */
export async function ledgerView(circleId: string, mode: "member" | "public") {
  const d = db();
  const [circle] = await d.select({ id: s.circles.id, name: s.circles.name }).from(s.circles).where(eq(s.circles.id, circleId));
  if (!circle) return null;
  const ms = await d.select({ id: s.memberships.id, memberId: s.members.id, name: s.members.name }).from(s.memberships).innerJoin(s.members, eq(s.members.id, s.memberships.memberId)).where(eq(s.memberships.circleId, circleId)).orderBy(asc(s.memberships.createdAt));
  const label = (n: string) => (mode === "public" ? `${n.slice(0, 1)}.` : n);
  const names = new Map<string, string>();
  for (const m of ms) {
    names.set(m.id, label(m.name));
    names.set(m.memberId, label(m.name));
  }
  const chain = await readChain(d, circleId);
  const rows = chain
    .map((e) => ({ seq: e.seq, type: e.type, at: e.createdAt, line: narrate(e.type, e.payload as Record<string, unknown>, (id) => names.get(id) ?? "A member") }))
    .filter((r) => r.line !== null)
    .reverse();
  const sum = (types: string[], key: string) => chain.filter((e) => types.includes(e.type)).reduce((a, e) => a + Number((e.payload as Record<string, unknown>)[key] ?? 0), 0);
  const totals = {
    paidIn: sum(["CONTRIBUTION_PAID"], "amount") + sum(["CONTRIBUTION_PAID"], "fee") + sum(["RECOVERY_PAYMENT"], "amount"),
    paidOut: sum(["PAYOUT_SENT"], "amount"),
    covered: sum(["POOL_COVER", "RESERVE_COVER"], "amount"),
  };
  // Public mode: the hashed payloads stay intact (they are ids and amounts) so the chain still verifies.
  // The feed folds fees into "X paid"; the ledger keeps the separate fee line.
  const feedRows = rows.filter((r) => r.type !== "POOL_FEE_IN");
  return { circle, chain, rows, feedRows, totals };
}
