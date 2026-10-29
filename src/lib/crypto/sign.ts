import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";

/** Ed25519 keys for signing circle rules and trades. Keys are PEM strings. */
export function generateSigningKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function signMessage(privateKeyPem: string, message: string): string {
  return sign(null, Buffer.from(message), createPrivateKey(privateKeyPem)).toString("base64");
}

export function verifySignature(publicKeyPem: string, message: string, signatureB64: string): boolean {
  try {
    return verify(null, Buffer.from(message), createPublicKey(publicKeyPem), Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/**
 * Demo only (spec 4.2.2): member private keys at rest, AES-256-GCM with KEY_ENC_SECRET.
 * Long term the key stays on the member's device.
 */
function encKey(secret: string | undefined): Buffer {
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("KEY_ENC_SECRET is required in production");
    return Buffer.alloc(32, 7); // local dev and tests only
  }
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) throw new Error("KEY_ENC_SECRET must be 32 bytes, base64");
  return key;
}

export function encryptPrivateKey(pem: string, secret = process.env.KEY_ENC_SECRET): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(secret), iv);
  const body = Buffer.concat([cipher.update(pem, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decryptPrivateKey(enc: string, secret = process.env.KEY_ENC_SECRET): string {
  const [iv, tag, body] = enc.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !body) throw new Error("bad encrypted key");
  const d = createDecipheriv("aes-256-gcm", encKey(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
