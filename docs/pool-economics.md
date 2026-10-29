# Protection pool economics

Each contribution carries a protection fee. The fee funds a circle pool and a global reserve that pay a missed contribution so the round's recipient always gets the full pot.

## Fee

`fee = floor(contribution × bps / 10000)`

| Tier | bps | Covers per round |
|---|---|---|
| BASIC | 100 (1%) | 1 missed contribution, circle pool only |
| STANDARD | 200 (2%) | 1 missed, then the global reserve |
| PLUS | 300 (3%) | 2 missed, then the global reserve |

25% of each fee (`GLOBAL_RESERVE_SHARE_BPS=2500`) goes to the global reserve; the rest, plus any remainder cents, goes to the circle pool.

## Break-even

A pool breaks even when fees cover expected losses after recovery, plus a margin:

`f = p × (1 − r) × (1 + m)`

- `p`: chance a contribution is missed
- `r`: share of covered amounts later recovered
- `m`: safety margin

Example: p = 3%, r = 50%, m = 30% gives f = 0.03 × 0.5 × 1.3 ≈ 1.95%, which the STANDARD tier (2%) covers.

## Order of repayment

When a covered member repays, the money goes to the global reserve first (if it helped), then to the circle pool.

## Tests

`src/lib/treasury/treasury.property.test.ts` runs 1,000 random circles (3–12 members, random amounts, defaults and recoveries) and checks that every payout is full or the circle pauses, money in equals money out plus pool plus reserve to the cent, and the ledger hash chain verifies.
