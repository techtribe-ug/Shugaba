import { z } from "zod";
import { callAgent } from "./call";

export const WidgetSpec = z.object({
  widget: z.enum(["coverage", "recoveries", "defaults", "flags", "cashflow", "scores"]),
  title: z.string().min(1).max(80),
  maxCoverage: z.number().min(0).max(100).nullable(),
  minCircles: z.number().int().min(1).max(20).nullable(),
});
export type WidgetSpec = z.infer<typeof WidgetSpec>;

/** Keyword reading of the operator's question; the mock and the fallback for the model. */
export function scriptedSpec(q: string): WidgetSpec {
  const t = q.toLowerCase();
  const num = Number(t.match(/(\d+(\.\d+)?)/)?.[1] ?? NaN);
  if (/coverage|cover|pool/.test(t)) return { widget: "coverage", title: Number.isFinite(num) ? `Circles whose pool covers fewer than ${num} missed payments` : "Pool coverage by circle", maxCoverage: Number.isFinite(num) ? num : null, minCircles: null };
  if (/recover|invoice|paid back|owed/.test(t)) return { widget: "recoveries", title: "Recoveries", maxCoverage: null, minCircles: null };
  if (/default|miss/.test(t)) return { widget: "defaults", title: /more than one|several|multiple/.test(t) ? "Members who missed in more than one circle" : "Members with missed payments", maxCoverage: null, minCircles: /more than one|several|multiple/.test(t) ? 2 : null };
  if (/fraud|flag|suspicious/.test(t)) return { widget: "flags", title: "Fraud flags", maxCoverage: null, minCircles: null };
  if (/score|level|tier/.test(t)) return { widget: "scores", title: "Members by level", maxCoverage: null, minCircles: null };
  return { widget: "cashflow", title: "Cash flow across all circles", maxCoverage: null, minCircles: null };
}

/**
 * Analyst agent (spec 11.4, polish): turns an operator question into a widget spec over read-only
 * views. The model only picks the widget and filters; code runs the query.
 */
export async function analystSpec(q: string): Promise<WidgetSpec> {
  const res = await callAgent({
    agent: "narrator",
    promptVersion: "analyst-v1",
    kind: "fast",
    system: "You turn a treasury operator's question into a widget spec for read-only views: coverage (pool covers N missed payments per circle; maxCoverage filters below a number), recoveries, defaults (minCircles filters members who missed in at least that many circles), flags, cashflow, scores. Pick one widget and write a short title.",
    prompt: q.slice(0, 300),
    schema: WidgetSpec,
    mock: () => scriptedSpec(q),
  });
  return res.output;
}
