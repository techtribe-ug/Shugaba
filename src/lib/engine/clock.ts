import { eq } from "drizzle-orm";
import { advanceClock, clockNow, type ClockState } from "@/lib/treasury";
import type { Db, Tx } from "@/lib/db/client";
import { clock } from "@/lib/db/schema";

export async function readClock(db: Db | Tx): Promise<ClockState> {
  const [row] = await db.select().from(clock).where(eq(clock.id, 1));
  if (!row) return { anchorMs: Date.now(), offsetMs: 0, speed: 1 };
  return { anchorMs: row.anchorMs, offsetMs: row.nowOffsetMs, speed: row.speed };
}

/** The app's "now". Every money decision reads time through here (spec 12). */
export async function now(db: Db | Tx): Promise<Date> {
  return clockNow(await readClock(db));
}

export async function moveClockTo(db: Db | Tx, target: Date): Promise<Date> {
  const state = await readClock(db);
  const current = clockNow(state).getTime();
  const by = Math.max(0, target.getTime() - current);
  const next = advanceClock(state, by);
  await db
    .insert(clock)
    .values({ id: 1, anchorMs: next.anchorMs, nowOffsetMs: next.offsetMs, speed: next.speed })
    .onConflictDoUpdate({ target: clock.id, set: { nowOffsetMs: next.offsetMs, updatedAt: new Date() } });
  return clockNow(next);
}
