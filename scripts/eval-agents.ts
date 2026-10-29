/**
 * pnpm eval:agents [--provider mock|google|anthropic]
 * Runs the agent evals and writes docs/evals.md. Mock in CI; a real provider on demand.
 */
import { writeFile } from "node:fs/promises";

const i = process.argv.indexOf("--provider");
if (i > 0 && process.argv[i + 1]) process.env.LLM_PROVIDER = process.argv[i + 1];
process.env.AGENT_TRACE ??= "off";

const { runEvals, evalsMarkdown } = await import("../src/lib/agents/evals");
const { llmProvider, modelId } = await import("../src/lib/agents/llm");
const rows = await runEvals();
await writeFile("docs/evals.md", evalsMarkdown(rows, llmProvider(), modelId("agent")));
const failed = rows.filter((r) => !r.pass);
console.log(`${rows.length - failed.length}/${rows.length} passing; wrote docs/evals.md`);
for (const f of failed) console.log(`FAIL ${f.suite}: ${f.name} -> ${f.detail}`);
process.exit(failed.length ? 1 : 0);
export {};
