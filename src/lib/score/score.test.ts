import { describe, expect, it } from "vitest";
import { applyScore, completionEvent, needsPlusTier, smartOrder, tierOf } from "./index";

describe("score", () => {
  it("clamps to 300..850", () => {
    expect(applyScore(848, "ON_TIME")).toEqual({ score: 850, delta: 2 });
    expect(applyScore(320, "WRITTEN_OFF")).toEqual({ score: 300, delta: -20 });
  });
  it("maps levels", () => {
    expect(tierOf(560)).toBe("SILVER");
    expect(tierOf(780)).toBe("DIAMOND");
    expect(tierOf(549)).toBe("BRONZE");
  });
  it("seed scores produce the golden pre-swap order", async () => {
    const scores = { amina: 760, ngozi: 740, ifeoma: 720, sani: 700, tunde: 690, musa: 560 };
    const { order } = await smartOrder(Object.entries(scores).map(([membershipId, score]) => ({ membershipId, score })).reverse(), "h");
    expect(order).toEqual(["amina", "ngozi", "ifeoma", "sani", "tunde", "musa"]);
    expect(needsPlusTier(order, scores)).toBe(false);
    expect(needsPlusTier(["musa", "x", "y", "z"], { musa: 400, x: 700, y: 700, z: 700 })).toBe(true);
  });
  it("ties are deterministic for one rules hash", async () => {
    const c = ["a", "b", "c", "d"].map((membershipId) => ({ membershipId, score: 600 }));
    expect((await smartOrder(c, "x")).order).toEqual((await smartOrder([...c].reverse(), "x")).order);
  });
  it("early collectors earn the bigger completion bonus", () => {
    expect(completionEvent(2, 6)).toBe("CYCLE_COMPLETED_AFTER_EARLY");
    expect(completionEvent(5, 6)).toBe("CYCLE_COMPLETED");
  });
});
