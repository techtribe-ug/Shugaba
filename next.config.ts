import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";
import { assertDemoGuard } from "./src/lib/security/demo-guard";

// Spec 4.2.1: the build fails when DEMO_MODE meets live PayPal or an unlisted host.
assertDemoGuard(process.env);

const config: NextConfig = {
  serverExternalPackages: ["pg-boss", "postgres"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders() }];
  },
};

export default config;
