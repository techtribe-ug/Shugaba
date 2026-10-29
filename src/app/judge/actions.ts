"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { seedDemo } from "@/lib/db/seed-core";
import { advanceGolden, failMusaNext, payMusaInvoice, runTundeSwap } from "@/lib/demo/golden";
import { resetMockProvider } from "@/lib/paypal";
import { rateLimit } from "@/lib/security/rate-limit";

export type JudgeResult = { ok: boolean; message: string };

function guard() {
  if (process.env.DEMO_MODE !== "true") throw new Error("The judge panel only runs in demo mode.");
}

async function run(fn: () => Promise<string>): Promise<JudgeResult> {
  try {
    guard();
    await rateLimit("judge", 60, 60);
    const message = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (e) {
    console.error("[judge]", e);
    return { ok: false, message: e instanceof Error ? e.message : "That did not work." };
  }
}

export const judgeAdvance = async () => run(advanceGolden);
export const judgeFailMusa = async () => run(async () => (await failMusaNext(), "Musa's next payment will fail."));
export const judgeSwap = async () =>
  run(async () => {
    const r = await runTundeSwap({ autoConfirm: false });
    return r.agreed ? "The agents agreed. Tunde and Ifeoma must each confirm." : "No agent accepted the swap.";
  });
export const judgePayInvoice = async (part: 1 | 2) => run(() => payMusaInvoice(part === 2 ? 2 : 1));
export const judgeReset = async () =>
  run(async () => {
    resetMockProvider();
    await seedDemo(db());
    return "Demo reset.";
  });
