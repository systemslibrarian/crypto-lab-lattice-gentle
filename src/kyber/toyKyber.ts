/**
 * Toy Kyber — the simplified Kyber-PKE of §V2a of the course slides, plus a
 * Fujisaki–Okamoto-style KEM wrapper, at the slides' toy parameters
 * q = 137, n = 4, k = 2, η = 2. Every operation is the real algebra in
 * R_137 = Z_137[x]/(x⁴+1); nothing is simulated.
 *
 * The exported KAT constants are the worked example of slides V2 pp. 50–51
 * verbatim; the unit tests replay it end to end.
 *
 * NOT production crypto: n = 4 means 16 possible plaintexts — a toy for
 * teaching the mechanism. Real ML-KEM uses q = 3329, n = 256, k ∈ {2,3,4}.
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

export const KYBER_PARAMS = { q: 137, n: 4, k: 2, eta: 2 } as const
const P: RingParams = KYBER_PARAMS
const HALF_Q = Math.ceil(KYBER_PARAMS.q / 2) // ⌈q/2⌉ = 69

export interface KyberPublicKey {
  A: PolyVec[] // k×k, row-major
  t: PolyVec
}
export interface KyberSecretKey {
  s: PolyVec
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

export function keygen(A: PolyVec[], s: PolyVec, e: PolyVec): { pk: KyberPublicKey; sk: KyberSecretKey } {
  const t = vecAdd(matVec(A, s, P), e, P)
  return { pk: { A, t }, sk: { s } }
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
// Random sampling (real randomness via crypto.getRandomValues; a deterministic
// variant driven by hash output feeds the FO re-encryption check)
// ---------------------------------------------------------------------------

/** Uniform integer in [0, q) by rejection from crypto.getRandomValues. */
function uniformMod(q: number): number {
  const buf = new Uint16Array(1)
  const limit = Math.floor(65536 / q) * q
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % q
  }
}

const randomSmallPoly = (eta: number): number[] =>
  Array.from({ length: P.n }, () => uniformMod(2 * eta + 1) - eta)

export const randomUniformPoly = (): number[] => Array.from({ length: P.n }, () => uniformMod(P.q))

export function randomKeyMaterial(): { A: PolyVec[]; s: PolyVec; e: PolyVec } {
  const { k, eta } = KYBER_PARAMS
  const A = Array.from({ length: k }, () => Array.from({ length: k }, randomUniformPoly))
  const s = Array.from({ length: k }, () => randomSmallPoly(eta))
  const e = Array.from({ length: k }, () => randomSmallPoly(eta))
  return { A, s, e }
}

export function randomEncRandomness(eta: number = KYBER_PARAMS.eta): KyberRandomness {
  const { k } = KYBER_PARAMS
  return {
    r: Array.from({ length: k }, () => randomSmallPoly(KYBER_PARAMS.eta)),
    e1: Array.from({ length: k }, () => randomSmallPoly(eta)),
    e2: randomSmallPoly(eta),
  }
}

// ---------------------------------------------------------------------------
// KEM wrapper (FO-style): encapsulation encrypts a random m with randomness
// derived from H(m ‖ pk); decapsulation decrypts, *re-encrypts and compares
// ciphertexts byte for byte* before accepting — the FO plaintext-awareness
// check, live. Hashing is real SHA-256 via WebCrypto.
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

export interface EncapsResult {
  m: number[]
  c: KyberCiphertext
  K: string
}

export async function encaps(pk: KyberPublicKey): Promise<EncapsResult> {
  const m = Array.from({ length: P.n }, () => uniformMod(2))
  const rnd = await deriveRandomness(m, pk)
  const c = encrypt(pk, m, rnd)
  const K = toHex(await sha256(new Uint8Array([...m, 254, ...ctBytes(c).map((x) => x % 256)])))
  return { m, c, K }
}

export interface DecapsResult {
  mPrime: number[]
  reEncrypted: KyberCiphertext
  match: boolean
  K: string | null
}

export async function decaps(sk: KyberSecretKey, pk: KyberPublicKey, c: KyberCiphertext): Promise<DecapsResult> {
  const mPrime = decrypt(sk, c).m
  const rnd = await deriveRandomness(mPrime, pk)
  const reEncrypted = encrypt(pk, mPrime, rnd)
  const match = JSON.stringify(ctBytes(reEncrypted)) === JSON.stringify(ctBytes(c))
  const K = match
    ? toHex(await sha256(new Uint8Array([...mPrime, 254, ...ctBytes(c).map((x) => x % 256)])))
    : null // real ML-KEM returns an implicit-rejection key; the toy fails closed
  return { mPrime, reEncrypted, match, K }
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
