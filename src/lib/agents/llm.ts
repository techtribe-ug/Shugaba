import type { LanguageModel } from "ai";

export type LlmProvider = "mock" | "google" | "anthropic";
export type ModelKind = "agent" | "fast";

/** LLM_PROVIDER=mock (default), google or anthropic. The only file that imports a provider package (spec 10.8). */
export function llmProvider(env: Record<string, string | undefined> = process.env): LlmProvider {
  const p = (env.LLM_PROVIDER ?? "mock").toLowerCase();
  return p === "google" || p === "anthropic" ? p : "mock";
}

const DEFAULTS: Record<Exclude<LlmProvider, "mock">, Record<ModelKind, string>> = {
  // Measured Nov 2026 on a free AI Studio key: 3.6-flash ~1.6 s, 3.1-flash-lite ~1.9 s; 3.8-flash timed out at 40 s and
  // 2.5 ids are limited to past users. Override with LLM_MODEL_AGENT / LLM_MODEL_FAST.
  google: { agent: "gemini-3.6-flash", fast: "gemini-3.1-flash-lite" },
  anthropic: { agent: "claude-sonnet-4-5", fast: "claude-haiku-4-5" },
};

export function modelId(kind: ModelKind, env: Record<string, string | undefined> = process.env): string {
  const p = llmProvider(env);
  if (p === "mock") return `mock-${kind}`;
  return (kind === "agent" ? env.LLM_MODEL_AGENT : env.LLM_MODEL_FAST) || DEFAULTS[p][kind];
}

/** Returns an AI SDK model, or null in mock mode (callers then use their scripted output). */
export async function getModel(kind: ModelKind, env: Record<string, string | undefined> = process.env): Promise<LanguageModel | null> {
  const p = llmProvider(env);
  if (p === "mock") return null;
  if (p === "google") {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error("LLM_PROVIDER=google needs GOOGLE_GENERATIVE_AI_API_KEY");
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(modelId(kind, env));
  }
  // Anthropic is for comparison runs; install @ai-sdk/anthropic to enable it.
  throw new Error("LLM_PROVIDER=anthropic is not installed in this build");
}
