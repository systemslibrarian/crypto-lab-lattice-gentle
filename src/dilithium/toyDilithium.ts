/**
 * Toy Dilithium — the "Dilithium without t compression" scheme of §V3b of the
 * course slides, at the slides' toy parameters: q = 16417, n = 4,
 * (k, ℓ) = (3, 2), η = 10, γ1 = 1024, τ = 4, β = τη = 40, γ2 = 513,
 * α = 2γ2 = 1026. All algebra is real arithmetic in Z_16417[x]/(x⁴+1),
 * including Fiat–Shamir with aborts (rejection sampling) in signing and the
 * HighBits comparison in verification. Hashing is real SHA-256 via WebCrypto.
 *
 * The exported KAT constants are the worked example of slides V3 pp. 106–109
 * verbatim; the unit tests replay it end to end.
 *
 * NOT production crypto: real ML-DSA uses q = 8380417, n = 256, and SHAKE.
 */
import {
  matVec,
  polyMul,
  vecAdd,
  vecSub,
  vecNormInf,
  vecMods,
  type Poly,
  type PolyVec,
  type RingParams,
} from '../ring/rq'
import { mod } from '../fq/zq'
import { cryptoRand, type Rand } from '../random'

export const DILITHIUM_PARAMS = {
  q: 16417,
  n: 4,
  k: 3,
  l: 2,
  eta: 10,
  gamma1: 1024,
  tau: 4,
  beta: 40, // τ·η
  gamma2: 513,
  alpha: 1026, // 2·γ2
} as const
const P: RingParams = DILITHIUM_PARAMS
const { q, n, k, l, eta, gamma1, beta, gamma2, alpha } = DILITHIUM_PARAMS

/**
 * Decompose r = r1·α + r0 with r0 = r mods α (so r0 ∈ (−α/2, α/2]).
 * Edge case as in Dilithium: if r1 = (q−1)/α, wrap r1 to 0 and drop r0 by 1.
 */
export function decompose(r: number): { r1: number; r0: number } {
  const rr = mod(r, q)
  let r0 = rr % alpha
  if (r0 > alpha / 2) r0 -= alpha
  let r1 = (rr - r0) / alpha
  if (r1 === (q - 1) / alpha) {
    r1 = 0
    r0 = r0 - 1
  }
  return { r1, r0 }
}

export const highBits = (r: number): number => decompose(r).r1
export const lowBits = (r: number): number => decompose(r).r0

const vecHighBits = (a: PolyVec): number[][] => a.map((f) => f.map((c) => highBits(c)))
const vecLowBits = (a: PolyVec): number[][] => a.map((f) => f.map((c) => lowBits(c)))

export interface DilithiumKeys {
  A: PolyVec[] // k×ℓ, row-major
  s1: PolyVec
  s2: PolyVec
  t: PolyVec
}

export function keygenFrom(A: PolyVec[], s1: PolyVec, s2: PolyVec): DilithiumKeys {
  const t = vecAdd(matVec(A, s1, P), s2, P)
  return { A, s1, s2, t }
}

// ---------------------------------------------------------------------------
// Hashing / SampleInBall
// ---------------------------------------------------------------------------

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = new Uint8Array(data).buffer as ArrayBuffer
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
}

const enc = new TextEncoder()

/** μ = H(w1 ‖ M): the challenge seed c̃, as hex. */
export async function challengeSeed(w1: readonly number[][], message: string): Promise<Uint8Array> {
  return sha256(new Uint8Array([...w1.flat().map((x) => mod(x, 256)), 0, ...enc.encode(message)]))
}

/**
 * SampleInBall for the toy parameters: derive c ∈ B_τ from c̃. With n = τ = 4
 * every coefficient of c is ±1, so c is determined by 4 sign bits of the hash.
 */
export function sampleInBall(seed: Uint8Array): number[] {
  const c = new Array<number>(n)
  for (let i = 0; i < n; i++) c[i] = (seed[i] & 1) === 0 ? 1 : -1
  return c
}

// ---------------------------------------------------------------------------
// Sign / verify (Fiat–Shamir with aborts)
// ---------------------------------------------------------------------------

export interface AttemptTrace {
  y: number[][]
  w: number[][]
  w1: number[][]
  c: number[]
  z: number[][]
  zNormInf: number
  r0: number[][]
  r0NormInf: number
  accepted: boolean
  rejectedBecause: 'z' | 'r0' | null
}

export interface Signature {
  c: number[]
  z: PolyVec
}

export interface SignResult {
  signature: Signature
  attempts: AttemptTrace[]
}

/** y ∈ S̃γ1: coefficients uniform in (−γ1, γ1]. */
const randomMaskPoly = (rand: Rand): number[] =>
  Array.from({ length: n }, () => rand(2 * gamma1) - gamma1 + 1)

/**
 * One signing attempt with the given mask y and challenge c. Split out so the
 * KAT test can drive it with the slides' fixed y and c.
 */
export function signAttempt(keys: DilithiumKeys, y: PolyVec, c: Poly): AttemptTrace {
  const w = matVec(keys.A, y, P)
  const w1 = vecHighBits(w)
  const cs1 = keys.s1.map((s) => polyMul(c.map((x) => mod(x, q)), s, P))
  const z = vecAdd(y.map((f) => f.map((x) => mod(x, q))), cs1, P)
  const zNormInf = vecNormInf(z, P)
  const cs2 = keys.s2.map((s) => polyMul(c.map((x) => mod(x, q)), s, P))
  const wMinusCs2 = vecSub(w, cs2, P)
  const r0 = vecLowBits(wMinusCs2)
  const r0NormInf = Math.max(...r0.flat().map(Math.abs))
  const zOk = zNormInf < gamma1 - beta
  const r0Ok = r0NormInf < gamma2 - beta
  return {
    y: vecMods(y, P),
    w,
    w1,
    c: [...c],
    z: vecMods(z, P),
    zNormInf,
    r0,
    r0NormInf,
    accepted: zOk && r0Ok,
    rejectedBecause: zOk ? (r0Ok ? null : 'r0') : 'z',
  }
}

export async function sign(
  keys: DilithiumKeys,
  message: string,
  maxAttempts = 1000,
  rand: Rand = cryptoRand,
): Promise<SignResult> {
  const attempts: AttemptTrace[] = []
  for (let i = 0; i < maxAttempts; i++) {
    const y = Array.from({ length: l }, () => randomMaskPoly(rand))
    const w1 = vecHighBits(matVec(keys.A, y.map((f) => f.map((x) => mod(x, q))), P))
    const seed = await challengeSeed(w1, message)
    const c = sampleInBall(seed)
    const attempt = signAttempt(keys, y, c)
    attempts.push(attempt)
    if (attempt.accepted) {
      return { signature: { c: attempt.c, z: attempt.z }, attempts }
    }
  }
  throw new Error('signing did not converge')
}

export interface VerifyResult {
  zBoundOk: boolean
  zNormInf: number
  w1Prime: number[][]
  cPrime: number[] | null
  accepted: boolean
}

/**
 * Verification: check ‖z‖∞ < γ1 − β, recompute w1' = HighBits(Az − ct), and
 * re-derive the challenge from w1' and the message — both sides computed, then
 * compared. The signature is valid iff the recomputed challenge equals c.
 */
export async function verify(
  pk: { A: PolyVec[]; t: PolyVec },
  message: string,
  sig: Signature,
): Promise<VerifyResult> {
  const zPos = sig.z.map((f) => f.map((x) => mod(x, q)))
  const zNormInf = vecNormInf(zPos, P)
  const zBoundOk = zNormInf < gamma1 - beta
  const Az = matVec(pk.A, zPos, P)
  const ct = pk.t.map((tp) => polyMul(sig.c.map((x) => mod(x, q)), tp, P))
  const w1Prime = vecHighBits(vecSub(Az, ct, P))
  if (!zBoundOk) return { zBoundOk, zNormInf, w1Prime, cPrime: null, accepted: false }
  const seed = await challengeSeed(w1Prime, message)
  const cPrime = sampleInBall(seed)
  const accepted = JSON.stringify(cPrime) === JSON.stringify(sig.c)
  return { zBoundOk, zNormInf, w1Prime, cPrime, accepted }
}

/** Az − ct — exported so the UI can show it equals w − c·s2 (the MSIS view). */
export function azMinusCt(pk: { A: PolyVec[]; t: PolyVec }, sig: Signature): number[][] {
  const zPos = sig.z.map((f) => f.map((x) => mod(x, q)))
  const Az = matVec(pk.A, zPos, P)
  const ct = pk.t.map((tp) => polyMul(sig.c.map((x) => mod(x, q)), tp, P))
  return vecSub(Az, ct, P)
}

export function randomKeyMaterial(rand: Rand = cryptoRand): DilithiumKeys {
  const smallPoly = (): number[] => Array.from({ length: n }, () => rand(2 * eta + 1) - eta)
  const A = Array.from({ length: k }, () =>
    Array.from({ length: l }, () => Array.from({ length: n }, () => rand(q))),
  )
  const s1 = Array.from({ length: l }, smallPoly)
  const s2 = Array.from({ length: k }, smallPoly)
  return keygenFrom(A, s1, s2)
}

// ---------------------------------------------------------------------------
// KAT — the worked example of slides V3 pp. 106–109, verbatim.
// ---------------------------------------------------------------------------

export const DILITHIUM_KAT = {
  A: [
    [
      [15196, 7926, 8057, 13612],
      [14303, 5, 12257, 2347],
    ],
    [
      [9765, 10436, 10983, 5860],
      [5393, 311, 5144, 10841],
    ],
    [
      [11868, 7995, 10716, 3121],
      [9390, 2055, 6505, 2440],
    ],
  ] as PolyVec[],
  s1: [
    [2, 5, -10, -5],
    [2, 3, -4, -4],
  ] as PolyVec,
  s2: [
    [-8, 3, 4, 4],
    [8, 10, 1, 8],
    [-3, -8, 6, 6],
  ] as PolyVec,
  t: [
    [5384, 8401, 14221, 11425],
    [4578, 1291, 5976, 9841],
    [3959, 14751, 15381, 14072],
  ] as PolyVec,
  y: [
    [707, -155, 357, -822],
    [474, -566, -869, -542],
  ] as PolyVec,
  w: [
    [7023, 3184, 4074, 5566],
    [9495, 7254, 7431, 13483],
    [4189, 7420, 13635, 4161],
  ] as PolyVec,
  w1: [
    [7, 3, 4, 5],
    [9, 7, 7, 13],
    [4, 7, 13, 4],
  ] as PolyVec,
  c: [-1, -1, 1, -1] as Poly,
  z: [
    [715, -167, 359, -804],
    [475, -571, -870, -533],
  ] as PolyVec,
  wMinusCs2: [
    [7012, 3179, 4085, 5563],
    [9486, 7279, 7426, 13490],
    [4194, 7409, 13630, 4178],
  ] as PolyVec,
  r0: [
    [-170, 101, -19, 433],
    [252, 97, 244, 152],
    [90, 227, 292, 74],
  ] as PolyVec,
}
