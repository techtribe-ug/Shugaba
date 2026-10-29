/**
 * pnpm record:golden — runs the golden path once against the real LLM provider and saves each
 * golden-path agent output to src/lib/agents/fixtures/golden/*.json (spec 10.8). Judges' runs then
 * replay them with DEMO_MODE=true and LLM_REPLAY=true: zero model calls, same text every time.
 * Needs DATABASE_URL, LLM_PROVIDER=google and GOOGLE_GENERATIVE_AI_API_KEY. Resets the demo data.
 */
process.env.LLM_RECORD = "true";
process.env.LLM_REPLAY = "false";
process.env.PAYMENT_PROVIDER = "mock";

const { db, getConn } = await import("../src/lib/db/client");
const { seedDemo } = await import("../src/lib/db/seed-core");
const { advanceGolden, goldenState } = await import("../src/lib/demo/golden");
const { castId, FAMILY_CIRCLE_ID } = await import("../src/lib/demo/cast");
const { chatView } = await import("../src/lib/views/chat");
const { llmProvider } = await import("../src/lib/agents/llm");

if (llmProvider() === "mock") {
  console.error("Set LLM_PROVIDER=google (and the API key) to record.");
  process.exit(1);
}
await seedDemo(db());
// advanceGolden fails Musa's round-2 payment on its own. Musa's openers are recorded twice:
// once in grace, once after the pool covered him.
for (let i = 0; i < 40; i++) {
  const st = await goldenState();
  if (st.step >= 10) break;
  console.log(`step ${st.step}: ${await advanceGolden()}`);
  await chatView(FAMILY_CIRCLE_ID, castId("musa"));
}
console.log("recorded fixtures in src/lib/agents/fixtures/golden/");
await getConn().sql.end();
process.exit(0);
export {};
