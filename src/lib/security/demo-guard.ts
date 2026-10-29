type Env = Record<string, string | undefined>;

const LIVE_PAYPAL = "api-m.paypal.com";

/**
 * Spec 4.2.1. The demo "log in as" picker must never reach a real deployment: refuse to build or boot
 * when DEMO_MODE is on together with live PayPal or a site URL outside DEMO_ALLOWED_HOSTS.
 */
export function demoGuardProblems(env: Env): string[] {
  if (env.DEMO_MODE !== "true") return [];
  const problems: string[] = [];
  const base = env.PAYPAL_API_BASE ?? "";
  if (base.includes(LIVE_PAYPAL) && !base.includes("sandbox")) problems.push("DEMO_MODE=true with live PayPal API base");
  const allowed = (env.DEMO_ALLOWED_HOSTS ?? "localhost")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const site = env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    let host = "";
    try {
      host = new URL(site).hostname.toLowerCase();
    } catch {
      problems.push(`NEXT_PUBLIC_SITE_URL is not a URL: ${site}`);
    }
    if (host && !allowed.includes(host) && !(host === "127.0.0.1" && allowed.includes("localhost"))) {
      problems.push(`DEMO_MODE=true on host ${host}, which is not in DEMO_ALLOWED_HOSTS`);
    }
  }
  return problems;
}

export function assertDemoGuard(env: Env): void {
  const problems = demoGuardProblems(env);
  if (problems.length) throw new Error(`Refusing to start: ${problems.join("; ")}`);
}
