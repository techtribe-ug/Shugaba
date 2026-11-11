import { assertDemoGuard } from "./lib/security/demo-guard";
import { startWorker } from "./worker";

// Refuse unsafe demo configs (spec 4.2.1), then start the in-process worker.
assertDemoGuard(process.env);
if (process.env.RUN_WORKER === "true") {
  await startWorker().catch((e) => console.error("[worker] failed to start", e));
}

// Render's free plan puts the service to sleep after 15 minutes without visitors, so a shared link would open
// on a "waking up" screen for up to a minute. Ping our own public URL every 10 minutes so it stays awake.
// Render sets RENDER_EXTERNAL_URL; set KEEP_AWAKE=false to turn this off.
const publicUrl = process.env.KEEP_AWAKE_URL ?? process.env.RENDER_EXTERNAL_URL;
if (publicUrl && process.env.KEEP_AWAKE !== "false") {
  const target = `${publicUrl.replace(/\/$/, "")}/api/health`;
  const ping = () =>
    fetch(target, { cache: "no-store", headers: { "user-agent": "shugaba-keep-awake" } })
      .then((r) => console.log(`[keep-awake] ${r.status}`))
      .catch((e) => console.error("[keep-awake] failed", e instanceof Error ? e.message : e));
  setInterval(ping, 10 * 60 * 1000);
  console.log(`[keep-awake] pinging ${target} every 10 minutes`);
}
