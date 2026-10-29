import { eq, sql } from "drizzle-orm";
import type { PoolEntryType } from "@/lib/protocol";
import type { Tx } from "@/lib/db/client";
import { circles, globalReserve, poolLedger } from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";

/** Moves money in the circle pool (free or held bonuses) or the global reserve, with a pool_ledger row. */
export async function poolMove(
  tx: Tx,
  scope: { circleId: string; bucket: "free" | "bonus" } | "reserve",
  type: PoolEntryType,
  delta: number,
  ref?: string,
): Promise<number> {
  if (delta === 0) return 0;
  let balanceAfter: number;
  let circleId: string | null = null;
  if (scope === "reserve") {
    const [row] = await tx.update(globalReserve).set({ balance: sql`${globalReserve.balance} + ${delta}`, updatedAt: new Date() }).where(eq(globalReserve.id, 1)).returning({ b: globalReserve.balance });
    if (!row) throw new Error("global reserve row missing (run the seed)");
    balanceAfter = row.b;
  } else {
    circleId = scope.circleId;
    const col = scope.bucket === "free" ? circles.poolBalance : circles.bonusHeldBalance;
    const set = scope.bucket === "free" ? { poolBalance: sql`${col} + ${delta}` } : { bonusHeldBalance: sql`${col} + ${delta}` };
    const [row] = await tx.update(circles).set({ ...set, updatedAt: new Date() }).where(eq(circles.id, scope.circleId)).returning({ b: col });
    balanceAfter = row!.b;
  }
  if (balanceAfter < 0) throw new Error(`pool balance would go negative (${type})`);
  await tx.insert(poolLedger).values({ id: uuidv7(), circleId, type, amount: delta, balanceAfter, ref });
  return balanceAfter;
}
