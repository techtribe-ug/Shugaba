import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);

/**
 * Golden path E2E in mock mode (spec 15, M11). Runs against `pnpm start` in CI and reuses a
 * running dev server locally. Needs a migrated, seeded database at DATABASE_URL.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DEMO_MODE: "true", RUN_WORKER: "true", PAYMENT_PROVIDER: "mock", WHATSAPP_MODE: "mock", PORT: String(PORT) },
  },
});
