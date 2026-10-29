import { startWorker, stopWorker } from "./index";

/** `pnpm worker`: run the worker on its own for local debugging. */
startWorker().catch((e) => {
  console.error(e);
  process.exit(1);
});
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void stopWorker().then(() => process.exit(0)));
