import { describe, expect, it } from "vitest";
import { decryptPrivateKey, encryptPrivateKey, generateSigningKeys, signMessage, verifySignature } from "./sign";

describe("signing", () => {
  it("signs and verifies; rejects a changed message", () => {
    const k = generateSigningKeys();
    const sig = signMessage(k.privateKey, "rules-hash");
    expect(verifySignature(k.publicKey, "rules-hash", sig)).toBe(true);
    expect(verifySignature(k.publicKey, "rules-hash2", sig)).toBe(false);
    expect(verifySignature(k.publicKey, "rules-hash", "garbage")).toBe(false);
  });
  it("round-trips the encrypted private key, and a wrong secret fails", () => {
    const k = generateSigningKeys();
    const secret = Buffer.alloc(32, 1).toString("base64");
    const enc = encryptPrivateKey(k.privateKey, secret);
    expect(enc).not.toContain("PRIVATE KEY");
    expect(decryptPrivateKey(enc, secret)).toBe(k.privateKey);
    expect(() => decryptPrivateKey(enc, Buffer.alloc(32, 2).toString("base64"))).toThrow();
  });
});
