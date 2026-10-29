"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { memberFacts } from "@/lib/agents/facts";
import { shugabaReply } from "@/lib/agents/shugaba";
import { currentMember, sessionFreshForMoney } from "@/lib/auth/session";
import { EngineError, startMemberPayment } from "@/lib/engine";
import { rateLimit } from "@/lib/security/rate-limit";
import { chatHistory, saveChat } from "@/lib/views/chat";
import { isMember } from "@/lib/views/circle";

async function requireCircleMember(circleId: string) {
  const me = await currentMember();
  if (!me) redirect("/login");
  if (!(await isMember(circleId, me.id))) throw new EngineError("FORBIDDEN", "not in this circle");
  return me;
}

export async function sendChat(circleId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const me = await requireCircleMember(z.string().min(1).parse(circleId));
    const msg = z.string().trim().min(1).max(1000).parse(text);
    await rateLimit(`chat:${me.id}`, 20, 60);
    const facts = await memberFacts(circleId, me.id);
    if (!facts) throw new EngineError("NOT_FOUND", "circle not found");
    const history = (await chatHistory(circleId, me.id)).map((m) => ({ role: m.role, content: m.content }));
    await saveChat(circleId, me.id, "user", msg);
    const r = await shugabaReply({ text: msg, facts, history });
    await saveChat(circleId, me.id, "assistant", r.text, { quickReplies: r.quickReplies, mood: r.mood, action: r.action, rule: r.rule, plan: r.plan, actionAmount: r.actionAmount, degraded: r.degraded }, r.language);
    return { ok: true };
  } catch (e) {
    if (e instanceof EngineError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Type a message first." };
    console.error("[chat]", e);
    return { ok: false, error: "I'm busy right now. Try again in a minute." };
  }
}

/** The PayPal button under a plan. Opens PayPal (or the sandbox mock) to approve; capture happens on return. */
export async function payFromChat(circleId: string, action: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const me = await requireCircleMember(z.string().min(1).parse(circleId));
    if (!sessionFreshForMoney(me)) return { ok: false, error: "Please sign in again to pay." };
    await rateLimit(`money:${me.id}`, 10, 60);
    const a = z.enum(["pay_catchup", "pay_recovery_half", "pay_recovery_rest"]).parse(action);
    const r = await startMemberPayment({ memberId: me.id, circleId, purpose: a === "pay_catchup" ? "catchup" : "recovery", part: a === "pay_recovery_half" ? "half" : "rest" });
    if (!r.approvalUrl) return { ok: false, error: "PayPal did not return an approval link." };
    return { ok: true, url: r.approvalUrl };
  } catch (e) {
    if (e instanceof EngineError) return { ok: false, error: e.message };
    console.error("[chat pay]", e);
    return { ok: false, error: "That did not work. Your money isn't affected." };
  }
}
