/**
 * Toy Kyber — the simplified Kyber-PKE of §V2a of the course slides, plus a
 * Fujisaki–Okamoto-style KEM wrapper, at the slides' toy parameters
 * q = 137, n = 4, k = 2, η = 2. Every operation is the real algebra in
 * R_137 = Z_137[x]/(x⁴+1); nothing is simulated.
 *
 * The KEM wrapper implements IMPLICIT REJECTION as in FIPS 203 decapsulation:
 * when the re-encryption check fails, decapsulation still outputs a key — a
 * pseudorandom fallback derived from the secret value z and the ciphertext —
 * so nothing observable distinguishes a rejected ciphertext from a valid one.
 * The internal match bit is exposed to the UI only as a labelled teaching view.
 *
 * The exported KAT constants are the worked example of slides V2 pp. 50–51
 * verbatim; the unit tests replay it end to end.
 *
 * NOT ML-KEM: beyond the toy sizes, real ML-KEM (FIPS 203) specifies SHAKE/SHA3
 * hashing, ciphertext compression, normative encodings, and CBD sampling that
 * this teaching core deliberately omits. n = 4 means 16 possible plaintexts.
 */
import {
  matVec,
  matTVec,
  polyAdd,
  polySub,
  vecAdd,
  vecDot,
  polyNormInf,
  type Poly,
  type PolyVec,
  type RingParams,
} from '../ring/rq'
import { mods, mod } from '../fq/zq'
import { cryptoRand, type Rand } from '../random'

export const KYBER_PARAMS = { q: 137, n: 4, k: 2, eta: 2 } as const
const P: RingParams = KYBER_PARAMS
const HALF_Q = Math.ceil(KYBER_PARAMS.q / 2) // ⌈q/2⌉ = 69

export interface KyberPublicKey {
  A: PolyVec[] // k×k, row-major
  t: PolyVec
}
export interface KyberSecretKey {
  s: PolyVec
  /** implicit-rejection secret: the fallback key is derived from z (FIPS 203 shape) */
  z: number[]
}
export interface KyberCiphertext {
  u: PolyVec
  v: Poly
}

export type Bits = readonly number[] // n bits, each 0 or 1

/** Round_q (slides V2 p. 47): 0 if the symmetric residue is within q/4 of 0, else 1. */
export const roundq = (x: number): number => (Math.abs(mods(x, P.q)) < P.q / 4 ? 0 : 1)

/** Encode message bits as the polynomial ⌈q/2⌉·m(x). */
const encodeMsg = (m: Bits): number[] => m.map((b) => mod(b * HALF_Q, P.q))

export interface KyberRandomness {
  r: PolyVec
  e1: PolyVec
  e2: Poly
}

export function keygen(
  A: PolyVec[],
  s: PolyVec,
  e: PolyVec,
  rand: Rand = cryptoRand,
): { pk: KyberPublicKey; sk: KyberSecretKey } {
  const t = vecAdd(matVec(A, s, P), e, P)
  const z = Array.from({ length: 16 }, () => rand(256))
  return { pk: { A, t }, sk: { s, z } }
}

export function encrypt(pk: KyberPublicKey, m: Bits, rnd: KyberRandomness): KyberCiphertext {
  const u = vecAdd(matTVec(pk.A, rnd.r, P), rnd.e1, P)
  const v = polyAdd(polyAdd(vecDot(pk.t, rnd.r, P), rnd.e2, P), encodeMsg(m), P)
  return { u, v }
}

export function decrypt(sk: KyberSecretKey, c: KyberCiphertext): { m: number[]; noisy: number[] } {
  const noisy = polySub(c.v, vecDot(sk.s, c.u, P), P)
  return { m: noisy.map(roundq), noisy }
}

/**
 * The decryption error polynomial E = eᵀr + e2 − sᵀe1 (slides V2 p. 53).
 * Decryption succeeds iff ‖E‖∞ < q/4. The demo shows this budget live.
 */
export function noiseBudget(
  e: PolyVec,
  s: PolyVec,
  rnd: KyberRandomness,
): { E: number[]; normInf: number; limit: number; ok: boolean } {
  const E = polySub(polyAdd(vecDot(e, rnd.r, P), rnd.e2, P), vecDot(s, rnd.e1, P), P)
  const normInf = polyNormInf(E, P)
  return { E, normInf, limit: P.q / 4, ok: normInf < P.q / 4 }
}

// ---------------------------------------------------------------------------
// Sampling — the randomness source is injectable so the UI can run seeded,
// reproducible experiments (see src/random.ts); tests and defaults use
// crypto.getRandomValues.
// ---------------------------------------------------------------------------

const randomSmallPoly = (eta: number, rand: Rand): number[] =>
  Array.from({ length: P.n }, () => rand(2 * eta + 1) - eta)

export const randomUniformPoly = (rand: Rand = cryptoRand): number[] =>
  Array.from({ length: P.n }, () => rand(P.q))

export function randomKeyMaterial(rand: Rand = cryptoRand): { A: PolyVec[]; s: PolyVec; e: PolyVec } {
  const { k, eta } = KYBER_PARAMS
  const A = Array.from({ length: k }, () => Array.from({ length: k }, () => randomUniformPoly(rand)))
  const s = Array.from({ length: k }, () => randomSmallPoly(eta, rand))
  const e = Array.from({ length: k }, () => randomSmallPoly(eta, rand))
  return { A, s, e }
}

/**
 * Encryption randomness. `eta` scales only the error terms e1, e2 (the demo's
 * break-it slider); r keeps the scheme's own η so the comparison is honest:
 * what varies is the injected error size, not the whole algorithm.
 */
export function randomEncRandomness(eta: number = KYBER_PARAMS.eta, rand: Rand = cryptoRand): KyberRandomness {
  const { k } = KYBER_PARAMS
  return {
    r: Array.from({ length: k }, () => randomSmallPoly(KYBER_PARAMS.eta, rand)),
    e1: Array.from({ length: k }, () => randomSmallPoly(eta, rand)),
    e2: randomSmallPoly(eta, rand),
  }
}

// ---------------------------------------------------------------------------
// KEM wrapper (FO-style with implicit rejection): encapsulation encrypts a
// random m with randomness derived from H(m ‖ pk); decapsulation decrypts,
// re-encrypts and compares ciphertexts, then outputs either the real key or
// the z-derived fallback — same length, no observable difference on the wire.
// Hashing is real SHA-256 via WebCrypto.
// ---------------------------------------------------------------------------

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = new Uint8Array(data).buffer as ArrayBuffer
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
}

const pkBytes = (pk: KyberPublicKey): number[] => [
  ...pk.A.flat(2),
  ...pk.t.flat(),
]

/** Derive the encryption randomness deterministically from hash output. */
async function deriveRandomness(m: Bits, pk: KyberPublicKey): Promise<KyberRandomness> {
  const seed = await sha256(new Uint8Array([...m, 255, ...pkBytes(pk).map((x) => x % 256)]))
  const { k, eta } = KYBER_PARAMS
  let i = 0
  const next = (): number => {
    // rejection-sample a value in [−η, η] from successive hash bytes
    for (;;) {
      const byte = seed[i % seed.length] ^ (i > 31 ? i : 0)
      i++
      const v = byte % 8
      if (v < 2 * eta + 1) return v - eta
    }
  }
  const smallPoly = (): number[] => Array.from({ length: P.n }, next)
  return {
    r: Array.from({ length: k }, smallPoly),
    e1: Array.from({ length: k }, smallPoly),
    e2: smallPoly(),
  }
}

const ctBytes = (c: KyberCiphertext): number[] => [...c.u.flat(), ...c.v]

export const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

const deriveKey = async (m: Bits, c: KyberCiphertext): Promise<string> =>
  toHex(await sha256(new Uint8Array([...m, 254, ...ctBytes(c).map((x) => x % 256)])))

const deriveFallbackKey = async (z: number[], c: KyberCiphertext): Promise<string> =>
  toHex(await sha256(new Uint8Array([...z, 253, ...ctBytes(c).map((x) => x % 256)])))

export interface EncapsResult {
  m: number[]
  c: KyberCiphertext
  K: string
}

export async function encaps(pk: KyberPublicKey, rand: Rand = cryptoRand): Promise<EncapsResult> {
  const m = Array.from({ length: P.n }, () => rand(2))
  const rnd = await deriveRandomness(m, pk)
  const c = encrypt(pk, m, rnd)
  return { m, c, K: await deriveKey(m, c) }
}

export interface DecapsResult {
  mPrime: number[]
  reEncrypted: KyberCiphertext
  /** INTERNAL teaching view — on the wire nothing reveals this bit */
  match: boolean
  /** always a same-length key: the real one, or the z-derived fallback */
  K: string
  implicitRejection: boolean
}

export async function decaps(sk: KyberSecretKey, pk: KyberPublicKey, c: KyberCiphertext): Promise<DecapsResult> {
  const mPrime = decrypt(sk, c).m
  const rnd = await deriveRandomness(mPrime, pk)
  const reEncrypted = encrypt(pk, mPrime, rnd)
  const match = JSON.stringify(ctBytes(reEncrypted)) === JSON.stringify(ctBytes(c))
  const K = match ? await deriveKey(mPrime, c) : await deriveFallbackKey(sk.z, c)
  return { mPrime, reEncrypted, match, K, implicitRejection: !match }
}

// ---------------------------------------------------------------------------
// KAT — the worked example of slides V2 pp. 50–51, verbatim.
// ---------------------------------------------------------------------------

export const KYBER_KAT = {
  A: [
    [
      [21, 57, 78, 43],
      [126, 122, 19, 125],
    ],
    [
      [111, 9, 63, 33],
      [105, 61, 71, 64],
    ],
  ] as PolyVec[],
  s: [
    [1, 2, -1, 2],
    [0, -1, 0, 2],
  ] as PolyVec,
  e: [
    [1, 0, -1, 1],
    [0, -1, 1, 0],
  ] as PolyVec,
  t: [
    [55, 96, 123, 7],
    [32, 27, 127, 100],
  ] as PolyVec,
  m: [0, 1, 1, 1] as Bits, // the slides' plaintext m = 0111
  r: [
    [-2, 2, 1, -1],
    [-1, 1, 1, 0],
  ] as PolyVec,
  e1: [
    [1, 0, -2, 1],
    [-1, 2, -2, 1],
  ] as PolyVec,
  e2: [2, 2, -1, 1] as Poly,
  u: [
    [56, 32, 77, 9],
    [45, 21, 2, 127],
  ] as PolyVec,
  v: [3, 10, 8, 123] as Poly,
  noisy: [4, 60, 79, 66] as Poly, // v − sᵀu before rounding
}
