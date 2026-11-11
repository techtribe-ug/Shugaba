"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { currentMember, sessionFreshForMoney } from "@/lib/auth/session";
import { EngineError, startMemberPayment } from "@/lib/engine";
import { rateLimit } from "@/lib/security/rate-limit";
import { isMember } from "@/lib/views/circle";

/** "Pay now with PayPal" on My money: creates a PayPal order and sends the member to approve it. */
export async function payNow(circleId: string, what: "early" | "catchup" | "recovery_half" | "recovery_rest") {
  const me = await currentMember();
  if (!me) redirect(`/login?next=/c/${circleId}/money`);
  const id = z.string().min(1).parse(circleId);
  let url: string | null = null;
  let error: string | null = null;
  try {
    if (!(await isMember(id, me.id))) throw new EngineError("FORBIDDEN", "not in this circle");
    if (!sessionFreshForMoney(me)) throw new EngineError("FORBIDDEN", "Please sign in again to pay.");
    await rateLimit(`money:${me.id}`, 10, 60);
    const purpose = what === "early" ? "early" : what === "catchup" ? "catchup" : "recovery";
    const r = await startMemberPayment({ memberId: me.id, circleId: id, purpose, part: what === "recovery_half" ? "half" : "rest", returnTo: "money" });
    url = r.approvalUrl ?? null;
    if (!url) error = "PayPal did not return an approval link.";
  } catch (e) {
    error = e instanceof EngineError ? e.message : e instanceof Error && e.name === "PayPalUnavailableError" ? "PayPal isn't answering. Nothing was charged." : "That did not work. Your money isn't affected.";
    if (!(e instanceof EngineError)) console.error("[money pay]", e);
  }
  if (url) redirect(url);
  redirect(`/c/${id}/money?error=${encodeURIComponent(error ?? "unknown")}`);
}
