/**
 * Toy Kyber tests: the worked example of slides V2 pp. 50–51 as KATs, plus
 * round-trip, noise-budget, and KEM (FO re-encryption) behavior.
 */
import { describe, expect, it } from 'vitest'
import {
  KYBER_KAT,
  KYBER_PARAMS,
  keygen,
  encrypt,
  decrypt,
  noiseBudget,
  roundq,
  randomKeyMaterial,
  randomEncRandomness,
  encaps,
  decaps,
} from './toyKyber'

describe('KAT — slides V2 pp. 50–51 (q=137, n=4, k=2)', () => {
  const { pk, sk } = keygen(KYBER_KAT.A, KYBER_KAT.s, KYBER_KAT.e)

  it('KAT: key generation t = As + e', () => {
    expect(pk.t).toEqual(KYBER_KAT.t)
  })
  it('KAT: encryption u = Aᵀr + e1 and v = tᵀr + e2 + 69·m', () => {
    const c = encrypt(pk, KYBER_KAT.m, { r: KYBER_KAT.r, e1: KYBER_KAT.e1, e2: KYBER_KAT.e2 })
    expect(c.u).toEqual(KYBER_KAT.u)
    expect(c.v).toEqual(KYBER_KAT.v)
  })
  it('KAT: decryption computes v − sᵀu = 4+60x+79x²+66x³ and rounds to m = 0111', () => {
    const { m, noisy } = decrypt(sk, { u: KYBER_KAT.u, v: KYBER_KAT.v })
    expect(noisy).toEqual(KYBER_KAT.noisy)
    expect(m).toEqual([...KYBER_KAT.m])
  })
  it('KAT: the noise budget of the worked example stays under q/4', () => {
    const { normInf, ok } = noiseBudget(KYBER_KAT.e, KYBER_KAT.s, {
      r: KYBER_KAT.r,
      e1: KYBER_KAT.e1,
      e2: KYBER_KAT.e2,
    })
    expect(ok).toBe(true)
    expect(normInf).toBeLessThan(KYBER_PARAMS.q / 4)
  })
})

describe('Round_q (slides V2 p. 47)', () => {
  it('rounds coefficients near 0 to 0 and near q/2 to 1', () => {
    expect(roundq(4)).toBe(0)
    expect(roundq(60)).toBe(1)
    expect(roundq(79)).toBe(1)
    expect(roundq(133)).toBe(0) // −4 mods 137
  })
})

describe('round-trips with fresh randomness', () => {
  it('decrypts every message correctly when the noise budget holds', () => {
    for (let trial = 0; trial < 50; trial++) {
      const { A, s, e } = randomKeyMaterial()
      const { pk, sk } = keygen(A, s, e)
      const m = Array.from({ length: KYBER_PARAMS.n }, () => (Math.random() < 0.5 ? 1 : 0))
      const rnd = randomEncRandomness()
      const budget = noiseBudget(e, s, rnd)
      const out = decrypt(sk, encrypt(pk, m, rnd)).m
      if (budget.ok) expect(out).toEqual(m)
      // η = 2 at these parameters can exceed q/4 only in rare tails; when the
      // budget holds (the common case), decryption must be exact.
    }
  })
  it('break-it-yourself: cranked-up noise eventually corrupts decryption', () => {
    // with error coefficients scaled far beyond η the budget must fail
    let sawFailure = false
    for (let trial = 0; trial < 100 && !sawFailure; trial++) {
      const { A, s, e } = randomKeyMaterial()
      const { pk, sk } = keygen(A, s, e)
      const m = [1, 0, 1, 0]
      const rnd = randomEncRandomness(30) // e1, e2 coefficients in [−30, 30]
      const out = decrypt(sk, encrypt(pk, m, rnd)).m
      if (JSON.stringify(out) !== JSON.stringify(m)) sawFailure = true
    }
    expect(sawFailure).toBe(true)
  })
})

describe('KEM wrapper (FO-style re-encryption check)', () => {
  it('encaps/decaps agree on the shared secret', async () => {
    const { A, s, e } = randomKeyMaterial()
    const { pk, sk } = keygen(A, s, e)
    const { c, K } = await encaps(pk)
    const d = await decaps(sk, pk, c)
    expect(d.match).toBe(true)
    expect(d.K).toBe(K)
  })
  it('fail-closed: a tampered ciphertext fails the re-encryption check', async () => {
    const { A, s, e } = randomKeyMaterial()
    const { pk, sk } = keygen(A, s, e)
    const { c } = await encaps(pk)
    const tampered = { u: c.u, v: c.v.map((x, i) => (i === 0 ? (x + 40) % KYBER_PARAMS.q : x)) }
    const d = await decaps(sk, pk, tampered)
    expect(d.match).toBe(false)
    expect(d.K).toBeNull()
  })
})
