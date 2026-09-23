// =============================================================================
// Deterministic, seedable PRNG utilities for IAT sequence generation.
// Every session stores a randomSeed; the same seed + condition + test
// definition version always reproduces the exact same trial sequence.
// =============================================================================

/** FNV-1a 32-bit hash — converts a seed string to a numeric state. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — small, fast, well-distributed, deterministic. */
export function mulberry32(state: number): () => number {
  let a = state >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Create an RNG from a string seed. */
export function createRng(seed: string): Rng {
  return mulberry32(hashSeed(seed));
}

/** In-place Fisher-Yates shuffle using the provided RNG. Returns the array. */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Derive a deterministic per-block seed from the session seed. */
export function blockSeed(sessionSeed: string, blockNumber: number): string {
  return `${sessionSeed}:${blockNumber}`;
}

/** Server-side cryptographically random seed for a session (16 hex chars). */
export function generateSessionSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Random 50/50 condition assignment (crypto, not seeded — stored in DB). */
export function assignConditionOrder(): "A" | "B" {
  return crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? "A" : "B";
}

/** Random anonymous participant code, e.g. "P-7K3M9QX2". */
export function generateAnonymousId(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no confusing chars
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `P-${s}`;
}
