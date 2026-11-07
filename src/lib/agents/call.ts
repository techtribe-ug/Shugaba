import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { uuidv7 } from "@/lib/ids";
import { db } from "@/lib/db/client";
import { agentTraces } from "@/lib/db/schema";
import { sha256Hex } from "@/lib/treasury/canonical";
import { getModel, modelId, type ModelKind } from "./llm";

export type AgentName = "shugaba" | "member" | "recovery" | "narrator";

export type CallAgentInput<T> = {
  agent: AgentName;
  promptVersion: string;
  kind: ModelKind;
  system: string;
  /** Untrusted member text goes here, never into `system`. */
  prompt: string;
  schema: z.ZodType<T>;
  /** Scripted answer for mock mode, evals and the fallback when the provider fails. */
  mock: () => T;
  /** Golden-path calls are recorded once and replayed in demo mode (spec 10.8). */
  fixture?: string;
};

const CACHE_MS = 10 * 60_000;
const g = globalThis as unknown as { __shugabaAgentCache?: Map<string, { at: number; value: unknown }> };
const cache = (g.__shugabaAgentCache ??= new Map());
const FIXTURES = path.join(process.cwd(), "src/lib/agents/fixtures/golden");

async function trace(row: { agent: string; promptVersion: string; model: string; input: unknown; output?: unknown; latencyMs: number; tokensIn?: number; tokensOut?: number; error?: string }) {
  if (process.env.AGENT_TRACE === "off") return;
  try {
    await db().insert(agentTraces).values({ id: uuidv7(), agent: row.agent, promptVersion: row.promptVersion, model: row.model, inputJson: row.input as object, outputJson: (row.output ?? null) as object | null, latencyMs: row.latencyMs, tokensIn: row.tokensIn ?? null, tokensOut: row.tokensOut ?? null, error: row.error ?? null });
  } catch (e) {
    console.error("[agents] trace failed", e);
  }
}

/**
 * The one LLM wrapper (spec 10.1). Structured output, validated with Zod after the model.
 * Order: replay fixture (demo) → 10-minute cache → provider → scripted fallback on error.
 * Returns `degraded: true` when the provider failed so the UI can show the busy state.
 */
export async function callAgent<T>(input: CallAgentInput<T>): Promise<{ output: T; degraded: boolean; model: string }> {
  const model = modelId(input.kind);
  const started = Date.now();
  const traceInput = { system: input.system.slice(0, 4000), prompt: input.prompt.slice(0, 4000) };

  if (input.fixture && process.env.DEMO_MODE === "true" && process.env.LLM_REPLAY === "true") {
    try {
      const raw = JSON.parse(await readFile(path.join(FIXTURES, `${input.fixture}.json`), "utf8"));
      return { output: input.schema.parse(raw), degraded: false, model: "replay" };
    } catch {
      // No recording yet: fall through to the live path.
    }
  }

  const key = await sha256Hex(`${input.agent}|${input.promptVersion}|${model}|${input.system}|${input.prompt}`);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { output: hit.value as T, degraded: false, model };

  const m = await getModel(input.kind).catch((e) => {
    console.error("[agents]", e);
    return null;
  });
  if (!m) {
    const output = input.schema.parse(input.mock());
    await trace({ agent: input.agent, promptVersion: input.promptVersion, model, input: traceInput, output, latencyMs: Date.now() - started });
    return { output, degraded: false, model };
  }
  try {
    const res = await generateText({ model: m, system: input.system, prompt: input.prompt, output: Output.object({ schema: input.schema }), maxRetries: 1, timeout: 20_000 });
    const output = input.schema.parse(res.output);
    cache.set(key, { at: Date.now(), value: output });
    if (input.fixture && process.env.LLM_RECORD === "true") {
      await mkdir(FIXTURES, { recursive: true });
      await writeFile(path.join(FIXTURES, `${input.fixture}.json`), JSON.stringify(output, null, 2) + "\n");
    }
    await trace({ agent: input.agent, promptVersion: input.promptVersion, model, input: traceInput, output, latencyMs: Date.now() - started, tokensIn: res.usage.inputTokens, tokensOut: res.usage.outputTokens });
    return { output, degraded: false, model };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await trace({ agent: input.agent, promptVersion: input.promptVersion, model, input: traceInput, latencyMs: Date.now() - started, error });
    return { output: input.schema.parse(input.mock()), degraded: true, model };
  }
}

const prompts = new Map<string, { version: string; body: string }>();

/** Prompts live in prompts/*.md with a `version:` header line. */
export async function loadPrompt(name: string): Promise<{ version: string; body: string }> {
  const hit = prompts.get(name);
  if (hit) return hit;
  const raw = await readFile(path.join(process.cwd(), "src/lib/agents/prompts", `${name}.md`), "utf8");
  const m = raw.match(/^version:\s*(\S+)\s*\n/);
  const p = { version: m?.[1] ?? "0", body: m ? raw.slice(m[0].length) : raw };
  prompts.set(name, p);
  return p;
}
