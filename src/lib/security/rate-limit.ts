import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { EngineError } from "@/lib/engine/types";

export class RateLimitError extends EngineError {
  constructor() {
    super("CONFLICT", "Too many tries. Please wait a minute and try again.");
  }
}

/**
 * Fixed-window limiter in Postgres (spec 4.2.3; no Redis). Throws RateLimitError when `key`
 * has been used more than `limit` times in the current `windowSec` window.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000);
  const rows = await db().execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart.toISOString()}::timestamptz, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  const count = Number((rows as unknown as { count: number }[])[0]?.count ?? 0);
  if (count > limit) throw new RateLimitError();
}
