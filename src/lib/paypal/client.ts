/**
 * Minimal typed PayPal REST client: OAuth token cached until 60 s before expiry, PayPal-Request-Id on
 * every POST, retries with backoff on 5xx and 429 only.
 */
// VERIFY: https://developer.paypal.com/api/rest/authentication/
export type PayPalConfig = { baseUrl: string; clientId: string; clientSecret: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> };

export class PayPalHttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    public debugId: string | null,
  ) {
    super(`PayPal HTTP ${status}${debugId ? ` (debug ${debugId})` : ""}`);
    this.name = "PayPalHttpError";
  }
  /** PayPal's error name, e.g. INSTRUMENT_DECLINED, from the issue details when present. */
  get issue(): string {
    const b = this.body as { name?: string; details?: { issue?: string }[] } | null;
    return b?.details?.[0]?.issue ?? b?.name ?? "UNKNOWN";
  }
}

export class PayPalClient {
  private token: { value: string; expiresAt: number } | null = null;
  private fetch: typeof fetch;
  private sleep: (ms: number) => Promise<void>;

  constructor(private cfg: PayPalConfig) {
    this.fetch = cfg.fetchImpl ?? fetch;
    this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;
    const res = await this.fetch(`${this.cfg.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new PayPalHttpError(res.status, await safeJson(res), res.headers.get("paypal-debug-id"));
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  async request<T>(method: "GET" | "POST" | "PATCH", path: string, opts: { body?: unknown; requestId?: string; prefer?: string; mockResponse?: string } = {}): Promise<T> {
    const maxAttempts = 4;
    for (let attempt = 1; ; attempt++) {
      const headers: Record<string, string> = { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" };
      if (method === "POST") headers["PayPal-Request-Id"] = opts.requestId ?? crypto.randomUUID();
      if (opts.prefer) headers.Prefer = opts.prefer;
      // Sandbox negative testing: PayPal returns the named error instead of processing (never sent unless asked for).
      if (opts.mockResponse) headers["PayPal-Mock-Response"] = opts.mockResponse;
      const res = await this.fetch(`${this.cfg.baseUrl}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
      if (res.ok) return (res.status === 204 ? undefined : await safeJson(res)) as T;
      if (res.status === 401 && attempt === 1) {
        this.token = null;
        continue;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxAttempts) throw new PayPalHttpError(res.status, await safeJson(res), res.headers.get("paypal-debug-id"));
      await this.sleep(2 ** attempt * 250);
    }
  }
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function linkOf(links: { rel: string; href: string }[] | undefined, rel: string): string | undefined {
  return links?.find((l) => l.rel === rel)?.href;
}
