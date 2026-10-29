import PgBoss from "pg-boss";
import { DEFAULT_DATABASE_URL } from "@/lib/db/client";
import { processWebhook, runDue, storeWebhook } from "@/lib/engine";
import { getMockProvider } from "@/lib/paypal";
import { dispatchNotifications } from "@/lib/notify/dispatch";
import { reconcile } from "./reconcile";

export type WorkerStatus = { running: boolean; startedAt: string | null; lastTickAt: string | null; lastError: string | null };

const g = globalThis as unknown as { __shugabaWorker?: { boss: PgBoss; status: WorkerStatus; timer: NodeJS.Timeout } };

export function workerStatus(): WorkerStatus {
  return g.__shugabaWorker?.status ?? { running: false, startedAt: null, lastTickAt: null, lastError: null };
}

export const QUEUES = { webhook: "webhook.process", tick: "clock.tick", reconcile: "reconcile.nightly" } as const;

export async function enqueueWebhook(eventId: string) {
  const w = g.__shugabaWorker;
  if (w) await w.boss.send(QUEUES.webhook, { eventId }, { singletonKey: eventId, retryLimit: 5, retryBackoff: true });
  else await processWebhook(eventId); // no worker in this process (tests, scripts): apply inline
}

/**
 * Starts pg-boss inside the web process (spec 4: Render free has no background workers).
 * The clock tick runs every 5 s in demo mode and every 60 s otherwise.
 */
export async function startWorker() {
  if (g.__shugabaWorker) return g.__shugabaWorker.status;
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL, max: 3 });
  const status: WorkerStatus = { running: false, startedAt: null, lastTickAt: null, lastError: null };
  boss.on("error", (e) => {
    status.lastError = String(e).slice(0, 300);
    console.error("[worker]", e);
  });
  await boss.start();
  for (const q of Object.values(QUEUES)) await boss.createQueue(q);

  await boss.work<{ eventId: string }>(QUEUES.webhook, async ([job]) => {
    if (job) await processWebhook(job.data.eventId);
  });
  await boss.work(QUEUES.tick, async () => {
    await tick();
  });
  await boss.work(QUEUES.reconcile, async () => {
    await reconcile();
  });
  // Backup tick through the queue, and the nightly reconciliation.
  await boss.schedule(QUEUES.tick, "* * * * *");
  await boss.schedule(QUEUES.reconcile, "15 2 * * *");

  // The mock provider emits webhook-shaped events into the same pipeline as real PayPal.
  getMockProvider()?.setSink(async (e) => {
    if (await storeWebhook(e, true)) await boss.send(QUEUES.webhook, { eventId: e.id }, { singletonKey: e.id });
  });

  async function tick() {
    try {
      await runDue();
      await dispatchNotifications();
      status.lastTickAt = new Date().toISOString();
      status.lastError = null;
    } catch (e) {
      status.lastError = String(e).slice(0, 300);
      console.error("[worker] tick failed", e);
    }
  }
  const every = process.env.DEMO_MODE === "true" ? 5_000 : 60_000;
  const timer = setInterval(tick, every);
  timer.unref?.();
  status.running = true;
  status.startedAt = new Date().toISOString();
  g.__shugabaWorker = { boss, status, timer };
  console.log(`[worker] started, tick every ${every / 1000}s`);
  return status;
}

export async function stopWorker() {
  const w = g.__shugabaWorker;
  if (!w) return;
  clearInterval(w.timer);
  await w.boss.stop({ graceful: true });
  g.__shugabaWorker = undefined;
}
