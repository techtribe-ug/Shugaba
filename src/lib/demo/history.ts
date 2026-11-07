import { and, eq, inArray, sql } from "drizzle-orm";
import { encryptPrivateKey, generateSigningKeys } from "@/lib/crypto/sign";
import { db as getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import {
  acceptOrderAndStart,
  collectRound,
  createCircle,
  joinCircle,
  now,
  PERIOD_MS,
  scanCircle,
  settleAndPay,
} from "@/lib/engine";
import { stableId } from "@/lib/ids";
import { withMockProvider } from "@/lib/paypal";

const NAMES = [
  "Aisha",
  "Bello",
  "Chiamaka",
  "Danjuma",
  "Emeka",
  "Fatima",
  "Garba",
  "Hadiza",
  "Ibrahim",
  "Jumoke",
  "Kelechi",
  "Ladi",
  "Maryam",
  "Nnamdi",
  "Obinna",
  "Patience",
  "Rukayya",
  "Segun",
  "Temitope",
  "Usman",
  "Victoria",
  "Yakubu",
  "Zainab",
  "Adaeze",
  "Babajide",
  "Chinedu",
  "Damilola",
  "Efe",
  "Funmi",
  "Hauwa",
  "Idris",
  "Kemi",
  "Lami",
  "Mohammed",
  "Nkechi",
  "Olumide",
  "Rashida",
  "Sadiq",
  "Tolu",
  "Uche",
];
const CITIES: [string, string, "en" | "ha" | "pcm"][] = [
  ["Kano", "NG", "ha"],
  ["Lagos", "NG", "pcm"],
  ["Abuja", "NG", "ha"],
  ["Houston", "US", "en"],
  ["London", "GB", "en"],
  ["Ibadan", "NG", "pcm"],
];

type Plan = {
  key: string;
  name: string;
  size: number;
  contribution: number;
  frequency: "WEEKLY" | "MONTHLY";
  tier: "BASIC" | "STANDARD" | "PLUS";
  /** Rounds to run now. */
  rounds: number;
  /** `${position}:${seq}` of payments that fail and get covered. */
  misses: string[];
  /** Members (by index) who share a PayPal email, for fraud rule 1. */
  sharedEmail?: [number, number];
  /** Before this round's payout the recipient changes PayPal method (fraud rule 2 hold). */
  methodChangeBeforeRound?: number;
};

const PLANS: Plan[] = [
  {
    key: "kano",
    name: "Kano Traders",
    size: 8,
    contribution: 10000,
    frequency: "WEEKLY",
    tier: "STANDARD",
    rounds: 8,
    misses: ["5:3"],
  },
  {
    key: "ibadan",
    name: "Ibadan Tailors",
    size: 10,
    contribution: 5000,
    frequency: "MONTHLY",
    tier: "PLUS",
    rounds: 10,
    misses: [],
  },
  {
    key: "lagos",
    name: "Lagos Nurses",
    size: 12,
    contribution: 20000,
    frequency: "MONTHLY",
    tier: "PLUS",
    rounds: 4,
    misses: ["9:2", "10:2", "11:3"],
    sharedEmail: [3, 7],
  },
  {
    key: "abuja",
    name: "Abuja Teachers",
    size: 6,
    contribution: 5000,
    frequency: "MONTHLY",
    tier: "STANDARD",
    rounds: 2,
    misses: [],
    methodChangeBeforeRound: 2,
  },
];

/**
 * Historical circles for the control tower (spec 13): one COMPLETED, one ACTIVE with low pool cover,
 * one PAUSED by a fraud hold, plus extra members. Built by running the real engine against a private
 * mock provider, so every ledger chain verifies. Idempotent: skips when already seeded.
 */
export async function seedHistory() {
  const db = getDb();
  const marker = stableId("member:history:0");
  const [done] = await db
    .select({ id: s.circles.id })
    .from(s.circles)
    .where(eq(s.circles.createdBy, marker));
  if (done) return { skipped: true };

  // Members: 40 extra people with scores spread across the levels.
  let n = 0;
  const people: string[] = [];
  for (const [i, name] of NAMES.entries()) {
    const id = stableId(`member:history:${i}`);
    const [, country, language] = CITIES[i % CITIES.length]!;
    const keys = generateSigningKeys();
    const score = 480 + ((i * 53) % 340);
    await db
      .insert(s.members)
      .values({
        id,
        name,
        email: `${name.toLowerCase()}.${i}@shugaba.demo`,
        country,
        language,
        paypalEmail: `${name.toLowerCase()}.${i}@example.com`,
        publicKey: keys.publicKey,
        privateKeyEnc: encryptPrivateKey(keys.privateKey),
        circleScore: score,
        isDemo: true,
      })
      .onConflictDoNothing();
    people.push(id);
  }

  // Collection mode follows PAYMENT_PROVIDER; history is always mock, so mandates activate at once.
  const providerEnv = process.env.PAYMENT_PROVIDER;
  process.env.PAYMENT_PROVIDER = "mock";
  try {
    return await withMockProvider(async (mock) => {
      for (const plan of PLANS) {
        const ids = people.slice(n, n + plan.size);
        n += plan.size;
        if (plan.sharedEmail) {
          const shared = `${plan.key}.shared@example.com`;
          await db
            .update(s.members)
            .set({ paypalEmail: shared })
            .where(inArray(s.members.id, [ids[plan.sharedEmail[0]]!, ids[plan.sharedEmail[1]]!]));
        }
        const owner = ids[0]!;
        const c = await createCircle(owner, {
          name: plan.name,
          contributionAmount: plan.contribution,
          size: plan.size,
          frequency: plan.frequency,
          protectionTier: plan.tier,
          graceHours: 48,
        });
        // The organiser's own membership needs a mandate too.
        const [own] = await db.select().from(s.memberships).where(eq(s.memberships.circleId, c.id));
        const { startMandate } = await import("@/lib/engine");
        await startMandate(own!.id);
        for (const id of ids.slice(1)) await joinCircle(id, c.inviteCode);
        await acceptOrderAndStart(c.id, owner);

        const rounds = await db
          .select()
          .from(s.rounds)
          .where(eq(s.rounds.circleId, c.id))
          .orderBy(s.rounds.seq);
        for (const r of rounds.slice(0, plan.rounds)) {
          for (const miss of plan.misses) {
            const [pos, seq] = miss.split(":").map(Number);
            if (seq !== r.seq) continue;
            const [m] = await db
              .select()
              .from(s.memberships)
              .where(and(eq(s.memberships.circleId, c.id), eq(s.memberships.position, pos!)));
            if (m) mock.forceFail(`${m.id}:${r.seq}`);
          }
          await collectRound(r.id);
          if (plan.methodChangeBeforeRound === r.seq) {
            const [rec] = await db
              .select({ memberId: s.memberships.memberId })
              .from(s.memberships)
              .where(eq(s.memberships.id, r.recipientMembershipId!));
            await db
              .update(s.members)
              .set({ paymentMethodChangedAt: await now(db), paypalVaultId: `VAULT-NEW-${r.seq}` })
              .where(eq(s.members.id, rec!.memberId));
          }
          const res = await settleAndPay(r.id);
          if (res?.paused) break;
        }
        // Pay back some covered misses so the recovery tracker shows both kinds.
        if (plan.key === "kano") {
          const { applyRecoveryPayment } = await import("@/lib/engine");
          const recs = await db
            .select()
            .from(s.recoveries)
            .where(
              sql`${s.recoveries.membershipId} in (select id from memberships where circle_id = ${c.id})`,
            );
          for (const r of recs) await applyRecoveryPayment(r.id, r.amountDue, `history-${r.id}`);
        }
        // Move the played rounds into the past; the next open round lands half a period ahead.
        const shift = (plan.rounds - 0.5) * PERIOD_MS[plan.frequency];
        await db
          .update(s.rounds)
          .set({
            collectionDueAt: sql`${s.rounds.collectionDueAt} - make_interval(secs => ${shift / 1000})`,
            graceEndsAt: sql`${s.rounds.graceEndsAt} - make_interval(secs => ${shift / 1000})`,
            payoutDueAt: sql`${s.rounds.payoutDueAt} - make_interval(secs => ${shift / 1000})`,
          })
          .where(eq(s.rounds.circleId, c.id));
        await scanCircle(c.id);
      }
      return { skipped: false };
    });
  } finally {
    process.env.PAYMENT_PROVIDER = providerEnv;
  }
}
