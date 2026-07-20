/**
 * Randomness sources. `cryptoRand` draws from crypto.getRandomValues (fresh,
 * non-reproducible). `seededRand` is mulberry32 — a tiny deterministic PRNG for
 * REPRODUCIBLE TEACHING EXPERIMENTS ONLY, never for key generation outside
 * this demo: two learners with the same seed see the same polynomials.
 */

/** Uniform integer in [0, bound). */
export type Rand = (bound: number) => number

export const cryptoRand: Rand = (bound) => {
  if (bound < 1 || bound > 4294967296) throw new Error(`cryptoRand bound out of range: ${bound}`)
  const buf = new Uint32Array(1)
  const limit = Math.floor(4294967296 / bound) * bound
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % bound
  }
}

/** mulberry32 — deterministic, NOT cryptographic. */
export function seededRand(seed: number): Rand {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return (bound) => Math.floor(next() * bound)
}

export const randomSeed = (): number => cryptoRand(1_000_000)
