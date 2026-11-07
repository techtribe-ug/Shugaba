import { and, asc, eq } from "drizzle-orm";
import { memberFacts } from "@/lib/agents/facts";
import { planFor, recoveryOpener, type PlanStep, type ShugabaReply } from "@/lib/agents/shugaba";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { uuidv7 } from "@/lib/ids";

export type ChatMeta = Partial<Pick<ShugabaReply, "quickReplies" | "mood" | "action" | "rule">> & { plan?: PlanStep[] | null; actionAmount?: number | null; openerKey?: string; degraded?: boolean };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; at: string; meta: ChatMeta };

export async function chatHistory(circleId: string, memberId: string): Promise<ChatMessage[]> {
  const rows = await db().select().from(s.agentMessages).where(and(eq(s.agentMessages.circleId, circleId), eq(s.agentMessages.memberId, memberId), eq(s.agentMessages.agent, "shugaba"))).orderBy(asc(s.agentMessages.createdAt), asc(s.agentMessages.id));
  return rows.filter((r) => r.role === "user" || r.role === "assistant").map((r) => ({ id: r.id, role: r.role as "user" | "assistant", content: r.content, at: r.createdAt.toISOString(), meta: (r.toolCallsJson ?? {}) as ChatMeta }));
}

export async function saveChat(circleId: string, memberId: string, role: "user" | "assistant", content: string, meta: ChatMeta = {}, language?: string) {
  await db().insert(s.agentMessages).values({ id: uuidv7(), circleId, memberId, agent: "shugaba", role, content, language: language ?? null, toolCallsJson: meta });
}

/** Chat for one member. Shugaba speaks first, once per event, when the member owes something. */
export async function chatView(circleId: string, memberId: string) {
  const facts = await memberFacts(circleId, memberId);
  if (!facts) return null;
  let messages = await chatHistory(circleId, memberId);
  const key = facts.owesNow ? `grace:${facts.owesNow.id}` : facts.recovery ? `recovery:${facts.recovery.id}` : null;
  if (key && !messages.some((m) => m.meta.openerKey === key)) {
    const o = await recoveryOpener(facts);
    if (o) {
      const { plan, amount } = planFor(o.action, facts, facts.member.language);
      await saveChat(circleId, memberId, "assistant", o.text, { quickReplies: o.quickReplies, mood: o.mood, action: o.action, rule: o.rule, plan, actionAmount: amount, openerKey: key }, facts.member.language);
      messages = await chatHistory(circleId, memberId);
    }
  }
  return { facts, messages };
}
