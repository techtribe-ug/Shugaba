import { now } from "./clock";
import { db } from "@/lib/db/client";
import { paypalStatus } from "@/lib/paypal";
import { collectRound, dueWork, settleAndPay } from "./rounds";

let running: Promise<number> | null = null;

/** Runs every round whose time has come by the app clock. Re-entrant calls share one run. */
export function runDue(): Promise<number> {
  if (!running) running = (async () => {
    try {
      // Simulated outage (judge panel): nothing is charged or paid out; due work waits for PayPal to come back.
      if (paypalStatus().simulated) return 0;
      let n = 0;
      for (let pass = 0; pass < 20; pass++) {
        const at = await now(db());
        const { collect, settle } = await dueWork(at);
        if (!collect.length && !settle.length) break;
        for (const r of collect) {
          await collectRound(r.id);
          n++;
        }
        for (const r of settle) {
          await settleAndPay(r.id);
          n++;
        }
      }
      return n;
    } finally {
      running = null;
    }
  })();
  return running;
}
