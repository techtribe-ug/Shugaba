"use server";

import { forbidden, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { analystSpec, type WidgetSpec } from "@/lib/agents/analyst";
import { currentMember } from "@/lib/auth/session";
import { EngineError, resumeCircle, reviewFlag } from "@/lib/engine";
import { rateLimit } from "@/lib/security/rate-limit";
import { circleHealth, defaultsByMember, openFlags, recoveriesView, scoreDistribution, cashFlow } from "@/lib/views/ops";

async function requireOperator() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/ops");
  if (!me.isOperator) forbidden();
  return me;
}

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => (e instanceof EngineError ? { ok: false, error: e.message } : e instanceof z.ZodError ? { ok: false, error: "Add a reason (3+ characters)." } : (console.error(e), { ok: false, error: "That did not work." }));

export async function reviewFlagAction(flagId: string, decision: "CLEARED" | "CONFIRMED", reason: string): Promise<Result> {
  const me = await requireOperator();
  try {
    await rateLimit(`ops:${me.id}`, 30, 60);
    await reviewFlag(z.string().min(1).parse(flagId), me.id, z.enum(["CLEARED", "CONFIRMED"]).parse(decision), z.string().trim().min(3).max(280).parse(reason));
    revalidatePath("/ops");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resumeCircleAction(circleId: string, reason: string): Promise<Result> {
  const me = await requireOperator();
  try {
    await rateLimit(`ops:${me.id}`, 30, 60);
    await resumeCircle(z.string().min(1).parse(circleId), me.id, z.string().trim().min(3).max(280).parse(reason));
    revalidatePath("/ops");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type AnalystAnswer = { spec: WidgetSpec; rows: Record<string, string | number>[] };

/** "Which circles have pool coverage below 2 payouts?" → a widget. Read-only. */
export async function askAnalyst(q: string): Promise<AnalystAnswer | { error: string }> {
  const me = await requireOperator();
  await rateLimit(`analyst:${me.id}`, 20, 60);
  const question = z.string().trim().min(3).max(300).safeParse(q);
  if (!question.success) return { error: "Ask a question first." };
  const spec = await analystSpec(question.data);
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
  let rows: Record<string, string | number>[] = [];
  if (spec.widget === "coverage") rows = (await circleHealth()).filter((c) => spec.maxCoverage === null || c.coverage < spec.maxCoverage).map((c) => ({ Circle: c.name, Status: c.status, Pool: usd(c.pool), "Covers misses": c.coverage.toFixed(1), "Reserve owed": usd(c.reserveOwed) }));
  if (spec.widget === "recoveries") rows = (await recoveriesView()).map((r) => ({ Member: r.member, Circle: r.circle, Due: usd(r.due), Paid: usd(r.paid), Status: r.status, "Days open": r.daysOpen }));
  if (spec.widget === "defaults") rows = (await defaultsByMember()).filter((d) => spec.minCircles === null || d.circles >= spec.minCircles).map((d) => ({ Member: d.member, Score: d.score, Circles: d.circles, Misses: d.misses }));
  if (spec.widget === "flags") rows = (await openFlags()).map((f) => ({ Circle: f.circle, Member: f.member ?? "", Rule: f.rule, Status: f.status }));
  if (spec.widget === "cashflow") rows = (await cashFlow()).map((c) => ({ Step: c.label, Amount: usd(c.value) }));
  if (spec.widget === "scores") rows = (await scoreDistribution()).map((b) => ({ Level: b.title, Range: `${b.min}–${b.max}`, Members: b.n }));
  return { spec, rows };
}
