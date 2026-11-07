import { assertDemoGuard } from "./lib/security/demo-guard";
import { startWorker } from "./worker";

// Refuse unsafe demo configs (spec 4.2.1), then start the in-process worker.
assertDemoGuard(process.env);
if (process.env.RUN_WORKER === "true") {
  await startWorker().catch((e) => console.error("[worker] failed to start", e));
}
