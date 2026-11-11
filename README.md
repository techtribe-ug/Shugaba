# shugaba

**Your savings circle, looked after.** Shugaba runs a rotating savings circle (adashe, esusu, ajo) on PayPal. Everyone pays in each round, one person collects the whole pot, and a small protection fee makes sure that person is paid in full even when someone misses a payment. Shugaba, a calm stone who lives in the app, explains the rules in English, Pidgin and Hausa, chases late payments kindly, and helps members swap turns.

Built for the PayPal AI hackathon.

- Live demo: TODO(link once deployed on Render)
- Video (under 3 min): TODO(YouTube link)

---

## Try it in 2 minutes

1. Open the live demo and go to **`/judge`**.
2. Press **Next** to walk the circle: create, join, order, collect, pay out, a missed payment, cover, a swap, recovery and completion. Every step runs the real engine.
3. Under **See it as**, open the app as Amina, Musa, Ngozi, Tunde, Ifeoma or Sani, or as the operator (control tower at `/ops`).
4. Press **Reset** to start again.

Demo logins are on `/login`. They only exist in demo mode, and the app refuses to boot in demo mode on any host outside `DEMO_ALLOWED_HOSTS` or against live PayPal.

## The problem

Rotating savings circles are one of the most common ways people save across West Africa and its diaspora. In Nigeria alone, 39% of adults (about 40 million people) used informal financial services in 2023, and 11.7 million saved or borrowed through a savings group ([EFInA, Access to Financial Services in Nigeria 2023](https://a2f.ng/wp-content/uploads/2024/07/A2F-2023-SURVEY-REPORT-1.pdf)). They run on trust and WhatsApp groups. When one person misses a payment, the person due to collect is short, and arguments start. Members abroad (Houston, London) and at home (Kano, Lagos, Abuja) cannot easily pay into the same circle.

Shugaba keeps the circle's familiar shape and fixes three things: the recipient always gets the full pot, every payment is on a public ledger anyone can verify, and money moves through PayPal across borders.

## Five pillars

| Pillar | What it does | Where |
|---|---|---|
| Full pot, every time | Risk-priced protection fee (1–3%) funds a circle pool and a global reserve that cover a missed payment. The defaulter gets a gentle repayment plan. | `src/lib/treasury`, `src/lib/engine/rounds.ts` |
| Open ledger | Every state change is a hash-chained ledger event. Anyone can verify the chain in the browser at `/verify/[id]` (initials only). | `src/lib/db/ledger.ts`, `src/components/verify-chain.tsx` |
| Shugaba | A chat companion in English, Pidgin and Hausa. Answers from the member's own ledger facts, cites the rule, offers to split a payment, and refuses to move money anywhere else. | `src/lib/agents/shugaba.ts` |
| Turn swaps | Drag your turn on the payout calendar. Member agents negotiate a swap within each member's preferences; both members sign. A bonus is held in the pool until the later payout. | `src/lib/engine/market.ts`, `src/components/payout-calendar` |
| Circle Score | Paying on time earns trust levels (Newcomer, Steady, Trusted, Pillar), awarded by Shugaba. Scores set the payout order and the protection tier. | `src/lib/score`, `src/lib/engine/score.ts` |

TODO(screenshots of home, calendar, chat, ledger, control tower)

## How money moves

```
member PayPal ──(Orders v2 capture / vaulted payment)──▶ platform account
                                                          │
                     protection fee ──▶ circle pool (75%) + global reserve (25%)
                                                          │
platform account ──(Payouts v1)──▶ this round's recipient: full pot
                                                          │
missed payment ──▶ pool covers ──▶ recovery invoice (Invoicing v2) ──▶ reserve repaid first, then pool
```

- Money is always an integer number of cents. Amounts become decimal strings only inside `src/lib/paypal`.
- Agents only propose. Only the treasury worker moves money, and every state change writes its ledger event first.
- The worker (pg-boss) runs inside the web process, so the whole app fits one free Render service.
- Production would need a licensed custody partner to hold pooled funds. The demo uses the PayPal sandbox or a built-in mock.

## Proven on the PayPal sandbox

The full Family Circle has been run end to end against the real PayPal sandbox, not only the mock:

- **6 members** saved PayPal for automatic contributions (Vault setup tokens, buyer approval, payment tokens).
- **36 contributions** of $51 charged to the saved PayPal accounts through Orders v2, each with a real capture id.
- **6 payouts** of $300 sent through Payouts v1, each confirmed by a `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` webhook before the round closed.
- **78 webhooks** received, every one signature-checked with `verify-webhook-signature`.
- A payout PayPal refused (`RECEIVER_COUNTRY_NOT_ALLOWED`) was marked failed from its webhook and retried to a corrected account, so a refused payout never leaves a round hanging.

## PayPal integration

| Use | API | Endpoint | Code |
|---|---|---|---|
| Contributions | Orders v2 | `POST /v2/checkout/orders`, `.../capture` | `src/lib/paypal/paypal.ts` |
| Automatic contributions | Vault / Subscriptions | `POST /v1/billing/plans`, `/v1/billing/subscriptions` | `src/lib/paypal/paypal.ts` |
| Payouts | Payouts v1 | `POST /v1/payments/payouts` | `src/lib/paypal/paypal.ts` |
| Recovery invoices | Invoicing v2 | `POST /v2/invoicing/invoices`, `.../send` | `src/lib/paypal/paypal.ts` |
| Reconciliation | Transaction Search | `GET /v1/reporting/transactions` | `src/worker/reconcile.ts` |
| Webhooks | Notifications | `POST /v1/notifications/verify-webhook-signature` | `src/app/api/webhooks/paypal` |

`PAYMENT_PROVIDER=mock` swaps in a mock provider that emits webhook-shaped events through the same pipeline, so the app runs with zero keys.

## AI

| Agent | Model | Purpose | Guardrail | Code |
|---|---|---|---|---|
| Shugaba (chat) | Gemini Flash | Answers questions, explains rules, offers payment plans | Facts come from the ledger; a regex guard blocks payout redirects, rule changes, other members' data and prompt injection; money moves need a confirm tap | `src/lib/agents/shugaba.ts`, `guard.ts` |
| Member agents | Gemini Flash | Negotiate turn swaps within each member's saved preferences | Every offer passes `validateTrade` (bonus cap 5%, tier rule, both signatures) | `src/lib/agents/market.ts` |
| Narrator | Gemini Flash-Lite | Short lines for the feed and notifications | Templates with numbers filled from the ledger | `src/lib/agents/narrate.ts` |
| Data analyst | Gemini Flash-Lite | Turns an operator's question into a chart or table spec | Read-only, fixed set of views | `src/lib/agents/analyst.ts` |

Every agent call goes through `callAgent`: recorded replay in demo mode, a 10-minute cache, the provider, then a scripted fallback, so the app never breaks when the model is slow or out of quota. Traces land in `agent_traces`. Evals: `pnpm eval:agents` writes [`docs/evals.md`](docs/evals.md) (48/48 in mock mode).

## Protection pool maths

The fee is `floor(contribution × bps / 10000)`: BASIC 1%, STANDARD 2%, PLUS 3%. 25% goes to the global reserve and the rest to the circle pool. See [`docs/pool-economics.md`](docs/pool-economics.md) for the break-even formula.

Property tests (fast-check, 1,000 runs each, random circles of 3–12 members with random defaults and recoveries) check that every payout is full or the circle pauses, the ledger balances to the cent, and the hash chain always verifies.

## Circle Score and fairness

Scores run from 300 to 850. On time +, paid in grace +, missed −, repaid partly restores, completing a cycle +. Smart order puts lower scores later in the rotation. A low-score member who moves earlier through a swap raises the circle's protection tier or the swap is rejected. Fraud rules flag shared PayPal accounts and linked defaults, and hold a payout when the recipient changed their PayPal account in the last 48 hours until an operator clears it.

## Sponsor tools

- **Render**: one free web service, see [`render.yaml`](render.yaml).
- **Bryntum** and **AG Studio**: the payout calendar and control tower ship with built-in fallbacks (`src/components/payout-calendar/grid.tsx`, `src/app/ops`), and the sponsor components can be swapped in when licences are set. See [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Run locally

Needs Node 22, pnpm 9 and Postgres 16 (or the Supabase CLI).

```bash
pnpm install
cp .env.example .env          # works as is: mock PayPal, mock LLM, mock WhatsApp
pnpm db:migrate && pnpm db:seed
pnpm dev                      # http://localhost:3000, worker included
```

| Command | What |
|---|---|
| `pnpm test` | Unit, property and integration tests (set `TEST_DATABASE_URL` for the integration ones) |
| `pnpm test:e2e` | Playwright golden path in mock mode |
| `pnpm eval:agents` | Agent evals, writes `docs/evals.md` |
| `pnpm db:reset` | Drop, migrate and reseed |

To use real services, fill in the PayPal sandbox, Gemini and WhatsApp keys in `.env` and set `PAYMENT_PROVIDER=paypal`, `LLM_PROVIDER=google`, `WHATSAPP_MODE=cloud`. Secrets never go in git; CI runs gitleaks on every push.

### Deploy

1. Create a Supabase free project and copy its pooled connection string.
2. On Render, create a Blueprint from this repo. Set the `sync: false` secrets in the dashboard (`DATABASE_URL`, `KEY_ENC_SECRET` as 32 random bytes in base64, `SESSION_SECRET` as 32+ random characters).
3. Point UptimeRobot at `/api/health` every 5 minutes. `.github/workflows/keepalive.yml` is a backup ping every 6 hours.

### Known issues

- **Members in Nigeria can pay in but cannot receive a PayPal payout.** PayPal does not allow Nigerian accounts to receive payments (`RECEIVER_COUNTRY_NOT_ALLOWED`). Collections from Nigeria work; a Nigerian member's payout needs another rail (a licensed local payout partner or bank transfer) before launch. Diaspora members (US, UK) receive normally.

- A late joiner takes an open seat through the invite link; the owner does not approve them separately yet.
- Subscription-mode collection is wired in the provider but not used by the worker. Vault mode is the default.
- Hausa prompts need a native speaker's review.

### What's next

A licensed custody partner, keys held on the member's device, more languages (Yoruba, Igbo, Twi), and WhatsApp as a full channel rather than notices only.

## Team

Erik, Daniel and Khalid. TODO(full names, links)

## Licence

[MIT](LICENSE)
