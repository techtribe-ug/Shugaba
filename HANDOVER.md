# Handover

Everything you need to pick up Shugaba. The app is feature-complete for the hackathon demo and runs end to end with no keys (mock PayPal, mock AI, mock WhatsApp).

## Where things are

| What | Where |
|---|---|
| Build spec (the source of truth for features and rules) | [`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md) |
| Where the build differs from the spec, and known gaps | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Build plan, timeline, tech stack and design system (PDF) | [`docs/plan/`](docs/plan/) |
| Screen designs, Pebble character, avatars, brand files | [`docs/design/`](docs/design/) (open the `.html` files in a browser) |
| Pool maths and agent evals | [`docs/pool-economics.md`](docs/pool-economics.md), [`docs/evals.md`](docs/evals.md) |
| Product overview, architecture and deploy steps | [`README.md`](README.md) |

## Run it locally (no Docker)

You need Node 22, pnpm 9 and Postgres 16 running on your machine.

1. Install Postgres 16 with the normal installer for your OS (Windows: EnterpriseDB installer, macOS: `brew install postgresql@16`, Linux: your package manager). Set the `postgres` user's password to `postgres`, or use your own and change the URL below.
2. Install and configure:

   ```bash
   pnpm install
   cp .env.example .env
   ```

3. In `.env`, point `DATABASE_URL` at your local Postgres. `.env.example` uses the Supabase CLI port (54322); a normal install uses 5432:

   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
   SESSION_SECRET=any-long-random-string-of-32-or-more-characters
   ```

   Leave everything else as it is. The defaults are mock mode (`DEMO_MODE=true`, `PAYMENT_PROVIDER=mock`, `LLM_PROVIDER=mock`, `WHATSAPP_MODE=mock`).

4. Create the tables, seed the demo circle and start the app:

   ```bash
   pnpm db:migrate && pnpm db:seed
   pnpm dev
   ```

   Open http://localhost:3000. The background worker runs inside the same process (`RUN_WORKER=true`).

If you prefer, `supabase start` (Supabase CLI) gives you a local Postgres on port 54322 instead, and the `.env.example` URL works unchanged.

### Look around

- **`/login`**: pick a demo member (Amina, Musa, Ngozi, Tunde, Ifeoma, Sani) or the treasury analyst, who opens the control tower at `/ops`.
- **`/judge`**: the guided walkthrough. Press **Next** to step through create, join, order, collect, payout, a missed payment, cover, a swap, recovery and completion. **See it as** switches member. **Reset** rebuilds the demo.
- `pnpm db:reset` drops, migrates and reseeds if the data gets into a strange state.

### Checks

```bash
pnpm typecheck && pnpm lint && pnpm test   # set TEST_DATABASE_URL for the integration tests
pnpm test:e2e                              # Playwright golden path in mock mode
pnpm eval:agents                           # agent evals, writes docs/evals.md
```

CI (`.github/workflows/ci.yml`) runs the same checks plus a gitleaks secret scan on every push and pull request.

## Keys for real mode

None of these are in the repo. Ask the project owner for them and put them only in your local `.env` or the Render dashboard, never in git.

| Service | Variables | Turn on with |
|---|---|---|
| Gemini (AI) | `GOOGLE_GENERATIVE_AI_API_KEY`, `LLM_MODEL_AGENT`, `LLM_MODEL_FAST` | `LLM_PROVIDER=google` |
| Supabase (hosted Postgres, optional magic-link sign-in) | `DATABASE_URL` (pooled connection string), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | set the values |
| PayPal sandbox | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_PRODUCT_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_PLATFORM_EMAIL`, `SANDBOX_EMAIL_*` | `PAYMENT_PROVIDER=paypal` |
| WhatsApp Cloud API | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | `WHATSAPP_MODE=cloud` |
| App secrets (generate your own) | `SESSION_SECRET` (32+ random characters), `KEY_ENC_SECRET` (32 random bytes, base64) | always |

Each service can be switched on by itself; the rest stay mocked.

## Not deployed yet

The Render service, Supabase project and UptimeRobot monitor still need to be created. Steps are under **Deploy** in the README: create a Supabase free project, create a Render Blueprint from this repo (`render.yaml`), set the secrets, then point UptimeRobot at `/api/health` every 5 minutes. Add the live link and video link to the README once they exist.

## Not built yet

- UI translation with next-intl. Shugaba's own messages are already in English, Pidgin and Hausa; the rest of the UI is English.
- Web push notifications (VAPID). Notifications show in the app at `/notifications`.
- An owner-approval step for late joiners. The invite link counts as the owner's approval.
- Bryntum Scheduler and AG Studio components. The payout calendar and control tower use built-in fallbacks with adapters ready for the licensed components.
- Subscription collection mode. It is wired in the PayPal provider but the worker uses vault mode.
- Hausa prompts still need a native speaker's review.

Open `TODO(...)` markers in the README (live link, video, screenshots, team names, a statistic) need filling before submission.

## Branches

Work happens on short-lived branches and pull requests into `main`. The old `build/*` branches are fully merged and can be deleted.
