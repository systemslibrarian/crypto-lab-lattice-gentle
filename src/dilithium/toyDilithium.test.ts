/**
 * Toy Dilithium tests: the worked example of slides V3 pp. 106–109 as KATs,
 * plus live sign/verify with rejection sampling and fail-closed behavior.
 */
import { describe, expect, it } from 'vitest'
import {
  DILITHIUM_KAT,
  DILITHIUM_PARAMS,
  keygenFrom,
  signAttempt,
  sign,
  verify,
  azMinusCt,
  decompose,
  highBits,
  lowBits,
  randomKeyMaterial,
} from './toyDilithium'
import { vecSub, matVec } from '../ring/rq'
import { seededRand } from '../random'

const P = { q: DILITHIUM_PARAMS.q, n: DILITHIUM_PARAMS.n }

describe('Decompose / HighBits / LowBits (slides V3 p. 107)', () => {
  it('KAT: HighBits(5566, 1026) = 5 and LowBits(5566, 1026) = 436', () => {
    expect(highBits(5566)).toBe(5)
    expect(lowBits(5566)).toBe(436)
  })
  it('r = r1·α + r0 with r0 ∈ (−α/2, α/2] for all r', () => {
    for (let r = 0; r < DILITHIUM_PARAMS.q; r += 7) {
      const { r1, r0 } = decompose(r)
      const alpha = DILITHIUM_PARAMS.alpha
      expect(r0).toBeGreaterThan(-alpha / 2 - 1)
      expect(r0).toBeLessThanOrEqual(alpha / 2)
      // at the wrap r1 = (q−1)/α ↦ 0 the identity holds modulo q
      const direct = r1 * alpha + r0
      expect(((direct - r) % DILITHIUM_PARAMS.q + DILITHIUM_PARAMS.q) % DILITHIUM_PARAMS.q).toBe(0)
    }
  })
})

describe('KAT — slides V3 pp. 106–109 (q=16417, n=4, k=3, ℓ=2)', () => {
  const keys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)

  it('KAT: key generation t = As1 + s2', () => {
    expect(keys.t).toEqual(DILITHIUM_KAT.t)
  })

  const attempt = signAttempt(keys, DILITHIUM_KAT.y, DILITHIUM_KAT.c)

  it('KAT: w = Ay and w1 = HighBits(w, 2γ2)', () => {
    expect(attempt.w).toEqual(DILITHIUM_KAT.w)
    expect(attempt.w1).toEqual(DILITHIUM_KAT.w1)
  })
  it('KAT: z = y + c·s1, with ‖z‖∞ < γ1 − β = 984', () => {
    expect(attempt.z).toEqual(DILITHIUM_KAT.z)
    expect(attempt.zNormInf).toBeLessThan(984)
  })
  it('KAT: r0 = LowBits(w − c·s2), with ‖r0‖∞ < γ2 − β = 473', () => {
    expect(attempt.r0).toEqual(DILITHIUM_KAT.r0)
    expect(attempt.r0NormInf).toBeLessThan(473)
    expect(attempt.accepted).toBe(true)
  })
  it('KAT: verification recomputes Az − ct = w − c·s2 and w1′ = w1', () => {
    const sig = { c: [...DILITHIUM_KAT.c], z: DILITHIUM_KAT.z }
    const target = azMinusCt({ A: keys.A, t: keys.t }, sig)
    expect(target).toEqual(DILITHIUM_KAT.wMinusCs2)
    const w1p = target.map((f) => f.map((x) => highBits(x)))
    expect(w1p).toEqual([...DILITHIUM_KAT.w1.map((f) => [...f])])
  })
})

describe('live sign/verify (Fiat–Shamir with aborts)', () => {
  it('signs and verifies a message with real rejection sampling', async () => {
    const keys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)
    const result = await sign(keys, 'lattice gentle')
    expect(result.attempts[result.attempts.length - 1].accepted).toBe(true)
    const v = await verify({ A: keys.A, t: keys.t }, 'lattice gentle', result.signature)
    expect(v.accepted).toBe(true)
  })
  // The toy challenge is only 4 sign bits (16 possible challenges), so a
  // tampered message re-derives the SAME challenge about 1 time in 16. The
  // rejection tests below therefore pin seeds (same seed derivation as the UI:
  // seed ^ 0x5eed) instead of sampling fresh randomness, and the forgery test
  // pins a seed where the collision actually happens — the toy-scale attack
  // the exhibit warns about.
  it('fail-closed: rejects a signature on a tampered message (pinned seed, no challenge collision)', async () => {
    const keys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)
    const result = await sign(keys, 'a gentle message', 1000, seededRand((7 ^ 0x5eed) >>> 0))
    const v = await verify({ A: keys.A, t: keys.t }, 'a gentle message!', result.signature)
    expect(v.accepted).toBe(false)
  })
  it('toy-scale forgery: a tampered message is ACCEPTED when the 4-bit challenge collides (pinned seed)', async () => {
    const keys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)
    const result = await sign(keys, 'a gentle message', 1000, seededRand((32 ^ 0x5eed) >>> 0))
    const honest = await verify({ A: keys.A, t: keys.t }, 'a gentle message', result.signature)
    expect(honest.accepted).toBe(true)
    // seed 32 makes H(w1' ‖ tampered) share its 4 challenge sign bits with the
    // original — the ~1/16 collision that a 256-coefficient challenge space
    // makes negligible in real ML-DSA.
    const forged = await verify({ A: keys.A, t: keys.t }, 'a gentle message!', result.signature)
    expect(forged.accepted).toBe(true)
    expect(forged.cPrime).toEqual(result.signature.c)
  })
  it('fail-closed: rejects a tampered z (both the recomputed challenge and the norm gate)', async () => {
    const keys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)
    const result = await sign(keys, 'msg', 1000, seededRand((7 ^ 0x5eed) >>> 0))
    const z = result.signature.z.map((f) => [...f])
    z[0][0] += 1
    const v = await verify({ A: keys.A, t: keys.t }, 'msg', { c: result.signature.c, z })
    expect(v.accepted).toBe(false)
  })
  it('fail-closed: rejects an oversized z before any algebra', async () => {
    const keys = randomKeyMaterial()
    const result = await sign(keys, 'msg')
    const z = result.signature.z.map((f) => [...f])
    z[0][0] = DILITHIUM_PARAMS.gamma1 + 100
    const v = await verify({ A: keys.A, t: keys.t }, 'msg', { c: result.signature.c, z })
    expect(v.zBoundOk).toBe(false)
    expect(v.accepted).toBe(false)
  })
})

describe('the MSIS connection (slides V3 p. 111)', () => {
  it('a valid signature is a short solution to [A | I]·(z, −w0) = ct + 2γ2·w1', () => {
    const keys = keygenFrom(DILITHIUM_KAT.A, DILITHIUM_KAT.s1, DILITHIUM_KAT.s2)
    const sig = { c: [...DILITHIUM_KAT.c], z: DILITHIUM_KAT.z }
    const target = azMinusCt({ A: keys.A, t: keys.t }, sig)
    // Az − ct = 2γ2·w1 + w0 where w0 = LowBits — short by the r0 gate
    const w1 = target.map((f) => f.map((x) => highBits(x)))
    const w0 = target.map((f) => f.map((x) => lowBits(x)))
    const recomposed = w1.map((f, i) => f.map((x, j) => x * DILITHIUM_PARAMS.alpha + w0[i][j]))
    expect(vecSub(target, recomposed, P).flat().every((x) => x === 0)).toBe(true)
    expect(Math.max(...w0.flat().map(Math.abs))).toBeLessThan(DILITHIUM_PARAMS.gamma2)
    // and A·z is really computed, not assumed
    expect(matVec(keys.A, sig.z.map((f) => f.map((x) => ((x % P.q) + P.q) % P.q)), P).length).toBe(3)
  })
})
