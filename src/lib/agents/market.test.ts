import { describe, expect, it } from "vitest";
import { negotiate, type MarketMember } from "./market";

const m = (name: string, turnSeq: number, prefs: Partial<MarketMember["prefs"]> = {}, collected = false): MarketMember => ({ membershipId: name, name, turnSeq, collected, prefs: { acceptSwapLater: false, minBonusBps: 0, maxBonus: 0, ...prefs } });

describe("Turn Market", () => {
  it("golden path: Sani declines, Ifeoma takes turn 5 for $5", async () => {
    const r = await negotiate({
      requester: m("tunde", 5, { maxBonus: 500 }),
      others: [m("amina", 1, {}, true), m("ngozi", 2, {}, true), m("ifeoma", 3, { acceptSwapLater: true, minBonusBps: 150, latestAcceptableRoundSeq: 6 }), m("sani", 4), m("musa", 6)],
      pot: 30000,
      reason: "School fees are due",
    });
    expect(r.terms).toEqual({ fromMembershipId: "tunde", toMembershipId: "ifeoma", fromRoundSeq: 5, toRoundSeq: 3, bonus: 500 });
    expect(r.transcript.map((t) => t.msg.kind)).toEqual(["SWAP_REQUEST", "DECLINE", "OFFER", "AGREE"]);
  });
  it("no deal when the ask is above the requester's max", async () => {
    const r = await negotiate({ requester: m("t", 5, { maxBonus: 100 }), others: [m("i", 3, { acceptSwapLater: true, minBonusBps: 300 })], pot: 30000, reason: "x" });
    expect(r.terms).toBeNull();
  });
  it("never asks above the 5% cap", async () => {
    const r = await negotiate({ requester: m("t", 5, { maxBonus: 100000 }), others: [m("i", 3, { acceptSwapLater: true, minBonusBps: 500 })], pot: 30000, reason: "x" });
    expect(r.terms?.bonus).toBe(1500);
  });
});
