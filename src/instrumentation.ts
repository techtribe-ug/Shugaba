/** Next.js boot hook. Node-only work lives in instrumentation-node.ts so the edge bundle never sees it. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
