import { createHash, randomBytes } from "node:crypto";

/** UUIDv7: 48-bit ms timestamp + random bits. Sortable by creation time. */
export function uuidv7(nowMs: number = Date.now()): string {
  const b = randomBytes(16);
  const ts = BigInt(nowMs);
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return format(b);
}

/** Stable UUID from a name (for seeded demo rows, so the seed is idempotent). */
export function stableId(name: string): string {
  const b = createHash("sha256").update(`shugaba:${name}`).digest().subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return format(b);
}

function format(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function inviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(8), (x) => alphabet[x % alphabet.length]).join("");
}
