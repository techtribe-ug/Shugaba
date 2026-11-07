# Decisions

Choices made while building, where the build differs from the spec or the spec left a gap. Newest last.

## Infrastructure

- **Plain Postgres locally, Supabase in deploy.** Local development and CI use Postgres 16 directly. The app only needs a connection string, so Supabase is the hosted Postgres on Render. Supabase Auth (magic link) is wired but optional; Realtime is replaced by an in-process event bus with server-sent events (`/api/events`), since web and worker share one process.
- **Demo session cookie.** Demo mode signs in seeded members with a signed, HttpOnly cookie instead of Supabase sessions. `/demo/as/[key]` switches member and only works in demo mode.
- **Views are TypeScript functions, not database views.** Ledger, calendar, score and control-tower views live in `src/lib/views`. They are easier to test and change during the hackathon than SQL views and migrations.
- **Seed on boot keeps the demo.** Render runs `pnpm db:seed --if-empty` at start, so a cold start after spin-down does not reset a judge's walk-through. The judge panel's Reset button rebuilds it.

## Money

- **`HELD` round state.** A payout held by fraud rule 2 (PayPal account changed within 48 h) moves the round to `HELD` and pauses the circle. An operator clearing the flag resumes the circle and settles held rounds. Every operator action writes `OPERATOR_ACTION` with a reason.
- **Collection mode.** Vault (save the payment method, then charge each round) is the default. Subscription mode exists in the PayPal provider but the worker does not use it yet. `COLLECTION_MODE=mock` is used with the mock provider.
- **Pool coverage** on the control tower is the circle pool divided by one contribution, i.e. how many missed payments the pool can cover. Pools funded by 1–3% fees never reach a full payout, so "payouts covered" would always read zero.

## Leaving and joining late

- **An open seat is covered by the pool** each round, attributed to the member who left, with no invoice. It counts against the tier's cover limit like a missed payment, so on STANDARD one more miss in the same round pauses the circle.
- **The open seat's own turn with nobody in it** refunds the leaver (what they paid in, less fees) and puts the rest of the pot back in the pool, repaying the reserve first. Over the circle this balances to the cent: the pool covered exactly the rounds the leaver no longer paid.
- **A late joiner's holdback** (missed rounds) repays the pool's covers for the empty seat first, then refunds the leaver as a separate PayPal payout on the joiner's payout date.
- **Leaving after collecting** turns the remaining contributions into one recovery invoice. The member is sent straight to pay it; if they don't, the pool covers their seat and the normal recovery flow applies.
- **Blocked cases.** A member can't leave during a pending or confirmed swap, while they owe the pool, or while their own payout is being paid.
- **No owner approval step for late joiners yet.** The invite link counts as the owner's invitation.

## UI

- **Calendar fallback.** The payout calendar ships with a CSS-grid component (`src/components/payout-calendar/grid.tsx`) that supports drag-to-swap. `index.tsx` is the adapter where Bryntum Scheduler can be swapped in when a licence is set.
- **Control tower fallback.** Widgets are hand-built (rings, bars, tables) rather than AG Studio components, for the same reason. The analyst agent returns a widget spec (`kind`, `title`, rows) that either renderer can draw.

## Notifications

- **WhatsApp notices are mock by default.** `WHATSAPP_MODE=mock` writes to `outbound_messages` and shows a preview on the judge panel. Cloud mode calls the WhatsApp Cloud API with approved utility templates; check the Graph API version and template names before turning it on.

## Not built yet

- Web push (VAPID). Notifications show in-app at `/notifications`.
- next-intl UI translation. Shugaba's own messages are in English, Pidgin and Hausa; UI chrome is English.
