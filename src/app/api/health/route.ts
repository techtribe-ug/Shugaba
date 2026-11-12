import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { now } from "@/lib/engine/clock";
import { workerStatus } from "@/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Keep-alive target (spec 4.1): one request keeps Render and Supabase awake. */
export async function GET() {
  let dbOk = false;
  let clock: string | null = null;
  try {
    await db().execute(sql`select 1`);
    dbOk = true;
    clock = (await now(db())).toISOString();
  } catch {
    dbOk = false;
  }
  const worker = workerStatus();
  // When this process started: if it never changes, the service never went to sleep.
  const upSince = new Date(Date.now() - process.uptime() * 1000).toISOString();
  return Response.json({ ok: dbOk, db: dbOk, worker: { running: worker.running, lastTickAt: worker.lastTickAt }, clock, upSince }, { status: dbOk ? 200 : 503 });
}
