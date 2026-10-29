import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";
import { assertDemoGuard } from "./src/lib/security/demo-guard";

// Spec 4.2.1: the build fails when DEMO_MODE meets live PayPal or an unlisted host.
assertDemoGuard(process.env);

const config: NextConfig = {
  serverExternalPackages: ["pg-boss", "pg", "postgres"],
  // forbidden() for /ops: non-operators get a real 403 (spec 4.2.7).
  experimental: { authInterrupts: true },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders() }];
  },
};

export default config;
