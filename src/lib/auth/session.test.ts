import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession } from "./session";

describe("session cookie", () => {
  it("round-trips and rejects tampering", () => {
    const t = encodeSession("m1");
    expect(decodeSession(t)?.memberId).toBe("m1");
    const [body, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ m: "someone-else", t: Date.now() })).toString("base64url");
    expect(decodeSession(`${forged}.${mac}`)).toBeNull();
    expect(decodeSession(`${body}.x${mac!.slice(1)}`)).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
  });
  it("expires after a week", () => {
    expect(decodeSession(encodeSession("m1", Date.now() - 8 * 86_400_000))).toBeNull();
  });
});
