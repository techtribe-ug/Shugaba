import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getChannel, MockChannel, previewText, verifyMetaSignature } from "./channels";
import { E164 } from "./optin";

describe("whatsapp notices", () => {
  it("checks Meta's signature", () => {
    const body = '{"entry":[]}';
    const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, sig, undefined)).toBe(false);
    expect(verifyMetaSignature(body, null, "s3cret")).toBe(false);
  });
  it("uses the mock channel unless cloud mode has keys", () => {
    expect(getChannel({})).toBeInstanceOf(MockChannel);
    expect(() => getChannel({ WHATSAPP_MODE: "cloud" })).toThrow();
  });
  it("accepts E.164 numbers only", () => {
    expect(E164.test("+2348031234567")).toBe(true);
    expect(E164.test("08031234567")).toBe(false);
  });
  it("previews template text", () => {
    expect(previewText("payout_sent", ["$300.00", "Family Circle"])).toBe("$300.00 from Family Circle is on its way to your PayPal.");
  });
});
